// MedScope Popup Script
(function() {
    'use strict';

    let currentSettings = {
        minIF: 0,
        maxIF: 200,
        quartiles: ['Q1', 'Q2', 'Q3', 'Q4'],
        enabled: true
    };

    let sortSettings = {
        sortBy: 'default',
        enabled: false
    };

    // DOM 元素
    const elements = {
        // 标签页
        tabButtons: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // 筛选
        minIF: document.getElementById('minIF'),
        maxIF: document.getElementById('maxIF'),
        quartileCheckboxes: document.querySelectorAll('.quartile-check input[type="checkbox"]'),
        alwaysOn: document.getElementById('alwaysOn'),
        applyFilterBtn: document.getElementById('applyFilter'),
        closeFilterBtn: document.getElementById('closeFilter'),
        presetBtns: document.querySelectorAll('.preset-btn'),
        
        // 排序
        sortSelect: document.getElementById('sortSelect'),
        sortEnabled: document.getElementById('sortEnabled'),
        applySortBtn: document.getElementById('applySort'),
        resetSortBtn: document.getElementById('resetSort'),
        
        // 其他
        matchCount: document.getElementById('matchCount'),
        showHelp: document.getElementById('showHelp')
    };

    // 标签页切换
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // 更新按钮状态
            elements.tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 更新内容显示
            elements.tabContents.forEach(content => {
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // 加载保存的设置
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['filterSettings', 'sortSettings']);
            
            if (result.filterSettings) {
                currentSettings = result.filterSettings;
                updateFilterUI();
            }
            
            if (result.sortSettings) {
                sortSettings = result.sortSettings;
                updateSortUI();
            }
            
            updateMatchCount();
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    // 更新筛选 UI
    function updateFilterUI() {
        elements.minIF.value = currentSettings.minIF;
        elements.maxIF.value = currentSettings.maxIF;
        elements.alwaysOn.checked = currentSettings.enabled;
        
        elements.quartileCheckboxes.forEach(checkbox => {
            checkbox.checked = currentSettings.quartiles.includes(checkbox.value);
        });
    }

    // 更新排序 UI
    function updateSortUI() {
        elements.sortSelect.value = sortSettings.sortBy;
        elements.sortEnabled.checked = sortSettings.enabled;
    }

    // 保存设置
    async function saveSettings() {
        try {
            await chrome.storage.sync.set({ 
                filterSettings: currentSettings,
                sortSettings: sortSettings
            });
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    // 应用筛选
    async function applyFilter() {
        // 收集设置
        currentSettings.minIF = parseFloat(elements.minIF.value) || 0;
        currentSettings.maxIF = parseFloat(elements.maxIF.value) || 200;
        currentSettings.enabled = elements.alwaysOn.checked;
        
        currentSettings.quartiles = Array.from(elements.quartileCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        
        // 保存并应用
        await saveSettings();
        await sendToContentScript();
        
        // 视觉反馈
        elements.applyFilterBtn.textContent = '✓ 已应用';
        setTimeout(() => {
            elements.applyFilterBtn.textContent = '应用筛选器';
        }, 1500);
        
        updateMatchCount();
    }

    // 关闭筛选
    async function closeFilter() {
        currentSettings.enabled = false;
        currentSettings.minIF = 0;
        currentSettings.maxIF = 200;
        currentSettings.quartiles = ['Q1', 'Q2', 'Q3', 'Q4'];
        
        updateFilterUI();
        await saveSettings();
        await sendToContentScript();
        updateMatchCount();
    }

    // 应用排序
    async function applySort() {
        sortSettings.sortBy = elements.sortSelect.value;
        sortSettings.enabled = elements.sortEnabled.checked;
        
        await saveSettings();
        
        // 通知 content script
        const tabs = await chrome.tabs.query({ url: 'https://pubmed.ncbi.nlm.nih.gov/*' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateSort',
                settings: sortSettings
            }).catch(() => {});
        });
        
        // 视觉反馈
        elements.applySortBtn.textContent = '✓ 已应用';
        setTimeout(() => {
            elements.applySortBtn.textContent = '应用排序';
        }, 1500);
    }

    // 重置排序
    function resetSort() {
        sortSettings.sortBy = 'default';
        sortSettings.enabled = false;
        updateSortUI();
        applySort();
    }

    // 快速预设
    const presets = {
        top: { minIF: 10, maxIF: 200, quartiles: ['Q1'], enabled: true },
        high: { minIF: 5, maxIF: 200, quartiles: ['Q1', 'Q2'], enabled: true },
        medium: { minIF: 3, maxIF: 200, quartiles: ['Q1', 'Q2', 'Q3', 'Q4'], enabled: true },
        all: { minIF: 0, maxIF: 200, quartiles: ['Q1', 'Q2', 'Q3', 'Q4'], enabled: true }
    };

    elements.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;
            if (presets[presetName]) {
                currentSettings = { ...presets[presetName] };
                updateFilterUI();
                applyFilter();
            }
        });
    });

    // 发送到 content script
    async function sendToContentScript() {
        const tabs = await chrome.tabs.query({ url: 'https://pubmed.ncbi.nlm.nih.gov/*' });
        
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateFilter',
                settings: currentSettings
            }).catch(() => {
                console.log('无法发送消息到标签页:', tab.id);
            });
        });
    }

    // 更新匹配数量
    async function updateMatchCount() {
        try {
            const response = await fetch(chrome.runtime.getURL('journal_data.json'));
            const data = await response.json();
            
            let count = 0;
            data.forEach(journal => {
                const jif = parseFloat(journal['JIF 2024']);
                const quartile = journal['JIF Quartile'];
                
                if (!isNaN(jif) && 
                    jif >= currentSettings.minIF && 
                    jif <= currentSettings.maxIF &&
                    currentSettings.quartiles.includes(quartile)) {
                    count++;
                }
            });
            
            elements.matchCount.textContent = count.toLocaleString();
        } catch (error) {
            elements.matchCount.textContent = '错误';
        }
    }

    // 帮助信息
    elements.showHelp.addEventListener('click', (e) => {
        e.preventDefault();
        alert(`MedScope 使用帮助

📊 按条件筛选：
• 设置影响因子的最小值和最大值
• 选择要显示的 JCR 分区（Q1-Q4）
• "始终开启筛选器"会记住设置

⇅ 按分数排序：
• 可以按影响因子或分区排序搜索结果
• 启用自动排序后会记住排序方式
• 恢复默认会刷新页面

💡 快速筛选：
• 顶级：只显示 IF≥10 且 Q1 的期刊
• 高分：IF≥5 且 Q1-Q2 的期刊
• 中等：IF≥3 的所有期刊

提示：可以先筛选再排序，效果更好！`);
    });

    // 事件监听
    elements.applyFilterBtn.addEventListener('click', applyFilter);
    elements.closeFilterBtn.addEventListener('click', closeFilter);
    elements.applySortBtn.addEventListener('click', applySort);
    elements.resetSortBtn.addEventListener('click', resetSort);
    
    // 实时更新匹配数量
    elements.minIF.addEventListener('input', () => {
        setTimeout(updateMatchCount, 300);
    });
    elements.maxIF.addEventListener('input', () => {
        setTimeout(updateMatchCount, 300);
    });
    elements.quartileCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateMatchCount);
    });

    // 初始化
    loadSettings();
})();
