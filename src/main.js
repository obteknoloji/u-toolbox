// main.js - Vanilla JS Logic for UI

let currentDictionary = {};
let currentLang = localStorage.getItem('appLang') || 'tr';

async function applyLang(lang) {
  try {
    const res = await fetch(`./locales/${lang}.json`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    window.appTranslations = data;
    currentDictionary = data;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && currentDictionary[key]) {
        // If element has spans (like buttons with icons), only update the text-bearing span
        const textSpan = el.querySelector('.i18n-text');
        if (textSpan) {
          textSpan.innerHTML = currentDictionary[key];
        } else {
          el.innerHTML = currentDictionary[key];
        }
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key && currentDictionary[key]) el.setAttribute('title', currentDictionary[key]);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && currentDictionary[key]) el.setAttribute('placeholder', currentDictionary[key]);
    });

    const langSelect = document.getElementById('lang-select');
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    document.documentElement.lang = lang;
    currentLang = lang;
    localStorage.setItem('appLang', lang);

    // Update Main process dictionary for menus and native elements
    if (window.electronAPI) {
      window.electronAPI.updateTrayLabels(currentDictionary);
    }

    // Refresh dynamic texts that evaluate on state changes
    if (typeof refreshStats === 'function') refreshStats();
  } catch (error) {
    console.error("Localization loading failed:", error);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  // Navigation Logic
  const navLinks = document.querySelectorAll('.nav-links li');
  const views = document.querySelectorAll('.view');

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      // Remove active class from all links
      navLinks.forEach(l => l.classList.remove('active'));
      // Add active class to clicked link
      link.classList.add('active');

      // Hide all views
      views.forEach(view => {
        view.classList.remove('active');
      });

      // Show target view
      const targetId = link.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });

  const aboutBtn = document.getElementById('about-btn');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const aboutView = document.getElementById('about');
      if (aboutView) aboutView.classList.add('active');
    });
  }

  function updateTranslations() {
    const i18nElements = document.querySelectorAll('[data-i18n]');
    i18nElements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (currentDictionary[key]) {
        // Handle input placeholders specifically
        if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
           el.placeholder = currentDictionary[key];
        } else {
           // For circular gauge values or dynamic spans, check if it's content-editable
           el.innerHTML = currentDictionary[key];
        }
      }
    });

    // Mirror to Main process for menus
    if (window.electronAPI) {
      window.electronAPI.updateTrayLabels(currentDictionary);
    }
  }

  // Helper for translating with placeholders (like {0})
  function getT(key, ...args) {
    let text = currentDictionary[key] || key;
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, arg);
    });
    return text;
  }

  // Example Toast Notification
  function showToast(message, type = 'info', ...args) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    // Translate and replace placeholders
    let translatedMsg = getT(message, ...args);

    toast.innerHTML = `<span>${icon}</span> <span>${translatedMsg}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Dashboard Logic ---
  if (window.electronAPI) {
    window.electronAPI.getSystemInfo().then(info => {
      document.getElementById('os-version').innerText = info.osVersion;
      
      const { days, hours, minutes } = info.uptimeRaw;
      let uptimeStr = '';
      if (days > 0) uptimeStr += `${days} ${currentDictionary.unit_day || 'Day'}, `;
      uptimeStr += `${hours} ${currentDictionary.unit_hour || 'Hour'}, ${minutes} ${currentDictionary.unit_min || 'Min'}`;
      
      document.getElementById('system-uptime').innerText = uptimeStr;

      const hwContainer = document.getElementById('hw-cards-container');
      const refreshBtn = document.getElementById('btn-refresh-hw');

      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          refreshBtn.style.transform = 'rotate(180deg)';
          setTimeout(() => refreshBtn.style.transform = 'rotate(0deg)', 300);
          loadHardwareCards(true);
        });
      }

      if (hwContainer) loadHardwareCards(false);

      function loadHardwareCards(forceReload) {
        const t = window.appTranslations || {};
        const getLbl = (k, f) => t[k] ? t[k] : f;

        const cached = localStorage.getItem('hwCache');
        let needsRefresh = forceReload || !cached;

        // Auto-refresh if cache is from an old version (missing new capacity keys)
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.totalRamGB === undefined) {
              needsRefresh = true;
            }
          } catch (e) {
            needsRefresh = true;
          }
        }

        if (needsRefresh) {
          hwContainer.innerHTML = `
                    <div id="hw-loading" style="color: var(--text-muted); font-size: 14px; display: flex; align-items: center; gap: 8px;">
                       <div style="width: 16px; height: 16px; border: 2px solid var(--primary); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                       <span data-i18n="hw_loading">${getLbl('hw_loading', '...')}</span>
                    </div>
                  `;

          window.electronAPI.getHardwareInfo().then(hw => {
            localStorage.setItem('hwCache', JSON.stringify(hw));
            renderHwHTML(hw, getLbl);
          }).catch(e => console.error("HW fetch fail", e));
        } else {
          renderHwHTML(JSON.parse(cached), getLbl);
        }
      }

      function renderHwHTML(hardware, getLbl) {
        let html = `
                <div class="hw-card">
                  <div class="hw-icon">🖧</div>
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_mb">${getLbl('dash_hw_mb', 'Motherboard')}</span>
                    <span class="hw-value" title="${hardware.mb || getLbl('msg_hw_unknown', 'Unknown')}">${hardware.mb || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
                <div class="hw-card">
                  <div class="hw-icon">🧠</div>
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_cpu">${getLbl('dash_hw_cpu', 'Processor')}</span>
                    <span class="hw-value" title="${hardware.cpu || getLbl('msg_hw_unknown', 'Unknown')}">${hardware.cpu || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
                <div class="hw-card">
                  <div class="hw-icon">🎮</div>
                  ${hardware.gpuVramGB && hardware.gpuVramGB > 0 ? `<div class="hw-badge">${hardware.gpuVramGB} GB</div>` : ''}
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_gpu">${getLbl('dash_hw_gpu', 'Graphics')}</span>
                    <span class="hw-value" title="${hardware.gpu || getLbl('msg_hw_unknown', 'Unknown')}">${hardware.gpu || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
                <div class="hw-card">
                  <div class="hw-icon">⚡</div>
                  ${hardware.totalRamGB ? `<div class="hw-badge">${hardware.totalRamGB} GB</div>` : ''}
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_ram">${getLbl('dash_hw_ram', 'Memory')}</span>
                    <span class="hw-value" title="${hardware.ram || getLbl('msg_hw_unknown', 'Unknown')}">
                      ${hardware.ram || getLbl('msg_hw_unknown', 'Unknown')} 
                      ${hardware.ramSlots ? `<span style="font-size:0.9em; opacity:0.8;">(<span id="hw-ram-slots">${hardware.ramSlots}</span> <span data-i18n="dash_slot">${getLbl('dash_slot', 'Slot')}</span>)</span>` : ''}
                    </span>
                  </div>
                </div>
              `;

        if (hardware.disks) {
          hardware.disks.forEach(disk => {
            html += `
                      <div class="hw-card" style="border-left: 3px solid var(--primary);">
                        <div class="hw-icon">💾</div>
                        <div class="hw-badge">${disk.sizeGB} GB</div>
                        <div class="hw-details">
                          <span class="hw-label"><span data-i18n="dash_hw_disk">${getLbl('dash_hw_disk', 'Storage')}</span> (${disk.type === 'HD' ? 'HDD' : disk.type})</span>
                          <span class="hw-value" title="${disk.name || getLbl('msg_hw_unknown', 'Unknown')}">${disk.name || getLbl('msg_hw_unknown', 'Unknown')}</span>
                        </div>
                      </div>
                    `;
          });
        }
        hwContainer.innerHTML = html;

        if (window.appTranslations) {
          hwContainer.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (window.appTranslations[key]) el.innerHTML = window.appTranslations[key];
          });
        }
      }
    }).catch(e => console.error(e));

    let uptimeTick = 0;
    async function refreshStats() {
      const isDashboardVisible = document.getElementById('dashboard').classList.contains('active');
      const isRamViewVisible = document.getElementById('subview-ram-clean') && document.getElementById('subview-ram-clean').classList.contains('active-sub');

      // Eğer ne Sistem Özeti ne de RAM sayfası açıksa, arka planı hiç yorma!
      if (!isDashboardVisible && !isRamViewVisible) {
        return;
      }

      try {
        const stats = await window.electronAPI.getUsageStats();

        if (isDashboardVisible) {
          // 60 saniyede bir (12 * 5sn) veya ilk açılışta güncelle
          if (stats.uptimeRaw && (uptimeTick === 0 || uptimeTick % 12 === 0)) {
            const { days, hours, minutes } = stats.uptimeRaw;
            let uptimeStr = '';
            if (days > 0) uptimeStr += `${days} ${currentDictionary.unit_day || 'Day'}, `;
            uptimeStr += `${hours} ${currentDictionary.unit_hour || 'Hour'}, ${minutes} ${currentDictionary.unit_min || 'Min'}`;
            const uEl = document.getElementById('system-uptime');
            if (uEl && uEl.innerText !== uptimeStr) {
               uEl.innerText = uptimeStr;
            }
          }
        }

        if (isRamViewVisible) {
          // RAM Viz Updates
          const gaugeFill = document.getElementById('ram-gauge-fill');
          const gaugeVal = document.getElementById('ram-gauge-value');
          const cardStandby = document.getElementById('ram-card-standby');
          const cardTotal = document.getElementById('ram-card-total');

          if (gaugeFill && gaugeVal) {
            const pct = parseInt(stats.ramUsage) || 0;
            const newText = `${pct}%`;
            if (gaugeVal.innerText !== newText) {
              gaugeVal.innerText = newText;
              const offset = 628 - (628 * pct) / 100;
              gaugeFill.style.strokeDashoffset = offset;
            }
          }
          if (cardStandby && cardStandby.innerText !== String(stats.ramUsage)) cardStandby.innerText = stats.ramUsage;
          if (cardTotal && stats.hardware && cardTotal.innerText !== String(stats.hardware.ram)) cardTotal.innerText = stats.hardware.ram;
        }

        uptimeTick++;
      } catch (e) { }
    }
    
    // Switch olaylarında anında güncellenmesi için event listener ekle
    document.querySelectorAll('.nav-links li').forEach(link => {
      link.addEventListener('click', () => {
        if (link.getAttribute('data-target') === 'dashboard') {
          uptimeTick = 0; // Dashboard'a dönünce anında güncelle
          refreshStats();
        }
      });
    });
    
    refreshStats();
    setInterval(() => {
      refreshStats();
    }, 5000);

  } else {
    document.getElementById('os-version').innerText = 'Windows 11 (Mock)';
    document.getElementById('system-uptime').innerText = '2 Gün, 4 Saat';
  }

  // --- Settings Logic ---
  const themeToggle = document.getElementById('theme-toggle');
  const trayToggle = document.getElementById('tray-toggle');
  const langSelect = document.getElementById('lang-select');

  // Load Preferences
  const isDark = localStorage.getItem('theme') !== 'light';
  themeToggle.checked = isDark;
  if (!isDark) document.body.classList.add('light-theme');

  const isTray = localStorage.getItem('minimizeToTray') === 'true';
  trayToggle.checked = isTray;
  if (window.electronAPI) window.electronAPI.setTraySetting(isTray);

  langSelect.value = currentLang;
  applyLang(currentLang);

  // Settings Events
  themeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    }
  });

  trayToggle.addEventListener('change', (e) => {
    const val = e.target.checked;
    localStorage.setItem('minimizeToTray', val);
    if (window.electronAPI) window.electronAPI.setTraySetting(val);
  });

  langSelect.addEventListener('change', (e) => {
    applyLang(e.target.value);
  });

  // --- Cleaner Sub-View & History Logic ---
  const btnCleanCard = document.getElementById('btn-open-clean');
  const btnCleanHistory = document.getElementById('btn-clean-history');

  const subViewJunk = document.getElementById('subview-clean-junk');
  const subViewHistory = document.getElementById('subview-history');
  const subViewRam = document.getElementById('subview-ram-clean');

  const cleanOptions = document.getElementById('clean-page-options');
  const cleanProgress = document.getElementById('clean-page-progress');
  const progressFill = document.getElementById('clean-progress-fill');
  const progressText = document.getElementById('clean-progress-text');

  let viewStack = [];
  let forwardStack = [];

  function openSub(el) {
    if (!viewStack.includes(el)) {
      viewStack.push(el);
      forwardStack = [];
    }
    el.classList.add('active-sub');
  }

  function closeSub(el) {
    el.classList.remove('active-sub');
    if (viewStack[viewStack.length - 1] === el) {
      forwardStack.push(viewStack.pop());
    }

    // Reset specific states
    if (el === subViewJunk) {
      cleanOptions.classList.remove('hidden');
      cleanProgress.classList.add('hidden');
      progressFill.style.width = '0%';
      progressText.innerText = '0%';
    }
  }

  // Bind Mouse Forward / Back triggers
  window.addEventListener('mouseup', (e) => {
    if (e.button === 3) {
      if (viewStack.length > 0) {
        const topView = viewStack[viewStack.length - 1];
        closeSub(topView);
      }
    } else if (e.button === 4) {
      if (forwardStack.length > 0) {
        const nextView = forwardStack.pop();
        viewStack.push(nextView);
        nextView.classList.add('active-sub');
      }
    }
  });

  // Sub-View Routing Ties
  btnCleanCard.addEventListener('click', () => {
    openSub(subViewJunk);
    loadJunkSizes();
  });

  btnCleanHistory.addEventListener('click', () => {
    renderHistory();
    openSub(subViewHistory);
  });

  document.getElementById('btn-page-history').addEventListener('click', () => {
    renderHistory();
    openSub(subViewHistory);
  });

  document.getElementById('btn-back-clean').addEventListener('click', () => closeSub(subViewJunk));
  document.getElementById('btn-back-history').addEventListener('click', () => closeSub(subViewHistory));
  document.getElementById('btn-back-ram').addEventListener('click', () => closeSub(subViewRam));
  document.getElementById('btn-ram-done').addEventListener('click', () => {
    document.getElementById('ram-page-result').classList.add('hidden');
    document.getElementById('ram-page-options').classList.remove('hidden');
    refreshStats();
  });

  document.getElementById('btn-clear-history').addEventListener('click', () => {
    localStorage.removeItem('cleanHistory');
    renderHistory();
    showToast('msg_history_cleared', 'success');
  });

  function renderHistory() {
    const historyStr = localStorage.getItem('cleanHistory');
    const listDiv = document.getElementById('history-list');
    const emptyDiv = document.getElementById('history-empty');
    listDiv.innerHTML = '';
    if (!historyStr) {
      listDiv.classList.add('hidden');
      emptyDiv.classList.remove('hidden');
      return;
    }
    const history = JSON.parse(historyStr);
    if (history.length === 0) {
      listDiv.classList.add('hidden');
      emptyDiv.classList.remove('hidden');
      return;
    }
    listDiv.classList.remove('hidden');
    emptyDiv.classList.add('hidden');

    history.slice().reverse().forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      // Localize target names if they match check keys
      const localizedTargets = item.targets.map(t => currentDictionary[`chk_${t}`] || t);

      div.innerHTML = `<h4>${item.date}</h4><p>${currentDictionary.ram_res_f || 'Freed:'} ${item.mb} MB</p><p style="margin-top:4px">${currentDictionary.sub_tw_p?.split('/')[1] || 'Scope:'} ${localizedTargets.join(', ')}</p>`;
      listDiv.appendChild(div);
    });
  }

  let junkSizesData = {};

  function updateTotalSelectedSize() {
    let totalBytes = 0;
    document.querySelectorAll('#clean-page-options input[type="checkbox"]:checked').forEach(cb => {
      if (junkSizesData[cb.value]) totalBytes += junkSizesData[cb.value];
    });
    const mb = (totalBytes / (1024 * 1024)).toFixed(2);
    const span = document.getElementById('total-selected-size');
    const label = currentDictionary.clean_summary || (currentLang === 'en' ? 'To Be Cleaned' : 'Temizlenecek');
    if (span) span.innerText = `${mb} MB ${label}`;
  }

  document.querySelectorAll('#clean-page-options input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateTotalSelectedSize);
  });

  async function loadJunkSizes() {
    const ids = ['user_temp', 'win_temp', 'win_update', 'prefetch', 'win_logs', 'delivery_opt', 'minidumps', 'thumb_cache', 'defender', 'wer', 'inet_cache', 'dx_cache', 'recycle_bin'];
    const calculatingLabel = currentDictionary.clean_calculating || '...';
    ids.forEach(id => {
      const el = document.getElementById(`size-${id}`);
      if (el) el.innerText = calculatingLabel;
    });

    if (window.electronAPI) {
      const res = await window.electronAPI.getJunkSizes();
      if (res.success && res.sizes) {
        junkSizesData = res.sizes;
        ids.forEach(id => {
          const bytes = res.sizes[id] || 0;
          const mb = (bytes / (1024 * 1024)).toFixed(2);
          const el = document.getElementById(`size-${id}`);
          if (el) el.innerText = `${mb} MB`;
        });
        updateTotalSelectedSize();
      } else {
        ids.forEach(id => {
          const el = document.getElementById(`size-${id}`);
          if (el) el.innerText = '0.00 MB';
        });
        junkSizesData = {};
        updateTotalSelectedSize();
      }
    }
  }

  document.getElementById('btn-start-clean').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#clean-page-options input[type="checkbox"]:checked');
    const targets = Array.from(checkboxes).map(c => c.value);
    if (targets.length === 0) return showToast('msg_no_selection', 'error');

    if (window.electronAPI) {
      cleanOptions.classList.add('hidden');
      cleanProgress.classList.remove('hidden');

      window.electronAPI.onCleanProgress((val) => {
        progressFill.style.width = val + '%';
        progressText.innerText = val + '%';
      });

      const res = await window.electronAPI.cleanJunk(targets);

      setTimeout(() => {
        cleanOptions.classList.remove('hidden');
        cleanProgress.classList.add('hidden');

        showToast(res.message, res.success ? 'success' : 'error', res.freed);
        if (res.success) {
          const historyStr = localStorage.getItem('cleanHistory') || '[]';
          const history = JSON.parse(historyStr);
          history.push({ date: new Date().toLocaleString(), mb: res.freed, targets });
          localStorage.setItem('cleanHistory', JSON.stringify(history));
          
          // Refresh sizes in the UI
          loadJunkSizes();
        }
      }, 700);
    } else {
      showToast('Electron API bulunamadı.', 'error');
    }
  });

  // --- Buttons Events ---


  // Initial privacy tweaks sync
  async function syncPrivacyTweaks() {
    if (!window.electronAPI) return;
    
    const tweaks = {
      'sec-tweak-telemetry': 'tweak-telemetry',
      'sec-tweak-location': 'tweak-location',
      'sec-tweak-activity': 'tweak-activity',
      'sec-tweak-ndu': 'tweak-disable-ndu',
      'perf-tweak-ultimate-power': 'tweak-ultimate-power',
      'perf-tweak-hibernate': 'tweak-hibernate'
    };

    const tweakIds = Object.values(tweaks);
    const statuses = await window.electronAPI.getAllTweakStatuses(tweakIds);

    for (const [uiId, tweakId] of Object.entries(tweaks)) {
      const el = document.getElementById(uiId);
      if (el) {
        const isEnabled = statuses[tweakId] || false;
        el.checked = isEnabled;
        
        el.addEventListener('change', async (e) => {
          const state = e.target.checked;
          const res = await window.electronAPI.applyTweak(tweakId, state);
          showToast(res.message, res.success ? 'success' : 'error');
          if (!res.success) {
            e.target.checked = !state;
          }
        });
      }
    }
  }

  async function syncAdvancedTweaks() {
    if (!window.electronAPI) return;
    const tweakIds = [
      'tweak-disable-nagle', 'tweak-disable-network-throttle',
      'tweak-system-responsiveness', 'tweak-disable-gamedvr',
      'tweak-classic-context', 'tweak-remove-bing', 'tweak-show-hidden',
      'tweak-verbose-status', 'tweak-disable-lock-screen'
    ];
    const statuses = await window.electronAPI.getAllTweakStatuses(tweakIds);
    for (const tId of tweakIds) {
      const isEnabled = statuses[tId] || false;
      const checkbox = document.getElementById(tId);
      if (checkbox) {
        checkbox.checked = isEnabled;
      }
    }
  }

  syncPrivacyTweaks();
  syncAdvancedTweaks();

  document.getElementById('btn-free-ram').addEventListener('click', async () => {
    openSub(subViewRam);
    document.getElementById('ram-page-options').classList.remove('hidden');
    document.getElementById('ram-page-progress').classList.add('hidden');
    document.getElementById('ram-page-result').classList.add('hidden');

    if (window.electronAPI) {
      refreshStats(); // Trigger immediate update for the new gauge
    }
  });

  document.getElementById('btn-start-ram-clean').addEventListener('click', async () => {
    document.getElementById('ram-page-options').classList.add('hidden');
    document.getElementById('ram-page-progress').classList.remove('hidden');

    const pFill = document.getElementById('ram-progress-fill');
    const pText = document.getElementById('ram-progress-text');

    pFill.style.width = '0%'; pText.innerText = '0%';

    if (window.electronAPI) {
      window.electronAPI.onRamProgress((val) => {
        pFill.style.width = val + '%';
        pText.innerText = val + '%';
      });

      // Helper for smart memory formatting
      const formatMemorySize = (mb) => {
          const uGB = 'GB';
          const uMB = 'MB';
        if (mb >= 1024) {
          const gb = Math.floor(mb / 1024);
          const remainingMb = Math.round(mb % 1024);
          return `${gb} ${uGB} ${remainingMb} ${uMB}`;
        }
        return `${Math.round(mb)} ${uMB}`;
      };

      const res = await window.electronAPI.freeRam();

      setTimeout(() => {
        document.getElementById('ram-page-progress').classList.add('hidden');
        document.getElementById('ram-page-result').classList.remove('hidden');
        if (res.success) {
          const b = parseFloat(res.beforeMB) || 0;
          const a = parseFloat(res.afterMB) || 0;
          const f = parseFloat(res.freedMB) || 0;
          
          const uMB = 'MB';

          // Calculate percentages if we have total memory
          window.electronAPI.getSystemInfo().then(info => {
             const totalGB = parseInt(info.hardware.ram) || 0;
             const totalMB = totalGB * 1024;
             
             if (totalMB > 0) {
                const bPct = Math.round((b / totalMB) * 100);
                const aPct = Math.round((a / totalMB) * 100);
                
                document.getElementById('ram-res-before').innerText = `${bPct}% (${Math.round(b)} ${uMB})`;
                document.getElementById('ram-res-after').innerText = `${aPct}% (${Math.round(a)} ${uMB})`;
                
                // Update the result gauge
                const resGaugeFill = document.getElementById('ram-res-gauge-fill');
                const resGaugeVal = document.getElementById('ram-res-gauge-value');
                if (resGaugeFill && resGaugeVal) {
                   resGaugeVal.innerText = `${aPct}%`;
                   const offset = 628 - (628 * aPct) / 100;
                   resGaugeFill.style.strokeDashoffset = offset;
                }
             } else {
                document.getElementById('ram-res-before').innerText = Math.round(b) + ` ${uMB}`;
                document.getElementById('ram-res-after').innerText = Math.round(a) + ` ${uMB}`;
             }
          });

          document.getElementById('ram-res-freed').innerText = formatMemorySize(f);
        }
      }, 600);
    }
  });

  function handleOpenRamOptimizer() {
    // Switch to performance view first
    const perfLink = Array.from(document.querySelectorAll('.nav-links li')).find(l => l.getAttribute('data-target') === 'performance');
    if (perfLink) perfLink.click();
    
    // Trigger the RAM sub-view
    const btnFreeRam = document.getElementById('btn-free-ram');
    if (btnFreeRam) btnFreeRam.click();
  }

  if (window.electronAPI) {
    window.electronAPI.onOpenRamOptimizer(() => {
      handleOpenRamOptimizer();
    });
  }

  // --- PC History Logic ---
  const subViewPcHistory = document.getElementById('subview-pc-history');
  document.getElementById('btn-open-pc-history')?.addEventListener('click', () => {
    openSub(subViewPcHistory);
    loadPcHistory();
  });
  document.getElementById('btn-back-pc-history')?.addEventListener('click', () => closeSub(subViewPcHistory));

  async function loadPcHistory() {
    const container = document.getElementById('gantt-container');
    const content = document.getElementById('pc-history-content');
    const loading = document.getElementById('pc-history-loading');

    loading.style.display = 'flex';
    content.classList.add('hidden');
    container.innerHTML = '';

    let events = [];
    if (window.electronAPI) events = await window.electronAPI.getPcUsageHistory();

    events.sort((a, b) => new Date(a.Time) - new Date(b.Time));

    let sessions = [];
    let currentSession = null;

    for (let ev of events) {
      const date = new Date(ev.Time);
      if (ev.Id === 6005 || ev.Id === 1) {
        if (!currentSession) {
          currentSession = { start: date, end: null };
        }
      }
      else if (ev.Id === 6006 || ev.Id === 42) {
        if (currentSession) {
          currentSession.end = date;
          sessions.push(currentSession);
          currentSession = null;
        }
      }
    }
    if (currentSession) {
      currentSession.end = new Date();
      sessions.push(currentSession);
    }

    function splitSessionAcrossDays(start, end) {
      let current = new Date(start);
      let pieces = [];
      while (current < end) {
        let nextMidnight = new Date(current);
        nextMidnight.setHours(24, 0, 0, 0);
        let pieceEnd = nextMidnight < end ? nextMidnight : end;
        pieces.push({ start: new Date(current), end: new Date(pieceEnd) });
        current = new Date(nextMidnight);
      }
      return pieces;
    }

    const formatDayKey = (d) => {
      const tzDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return tzDate.toISOString().split('T')[0];
    };

    let dailyData = {};
    for (let s of sessions) {
      let pieces = splitSessionAcrossDays(s.start, s.end);
      for (let p of pieces) {
        let dayKey = formatDayKey(p.start);
        if (!dailyData[dayKey]) dailyData[dayKey] = { date: p.start, blocks: [] };
        dailyData[dayKey].blocks.push(p);
      }
    }

    let sortedDays = Object.keys(dailyData).sort().reverse();
    const t = window.appTranslations || {};
    const getLbl = (k, f) => t[k] ? t[k] : f;

    let html = `
        <div class="gantt-header">
           <span>00:00</span><span>03:00</span><span>06:00</span><span>09:00</span>
           <span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span><span>24:00</span>
        </div>
      `;

    let totalSeconds = 0;
    for (let dayKey of sortedDays) {
      const dayInfo = dailyData[dayKey];
      const localeOpts = window.currentLang === 'en' ? 'en-US' : 'tr-TR';
      const options = window.currentLang === 'en' ? { month: 'short', day: 'numeric', weekday: 'short' } : { day: 'numeric', month: 'short', weekday: 'short' };
      const dateStr = dayInfo.date.toLocaleDateString(localeOpts, options);

      let rowHtml = `<div class="gantt-row"><div class="gantt-label">${dateStr}</div><div class="gantt-track">`;
      let dailySeconds = 0;

      for (let b of dayInfo.blocks) {
        const startOfDay = new Date(b.start);
        startOfDay.setHours(0, 0, 0, 0);

        const startSec = (b.start - startOfDay) / 1000;
        const endSec = (b.end - startOfDay) / 1000;
        const totalSec = 86400;

        dailySeconds += (endSec - startSec);

        const leftPct = (startSec / totalSec) * 100;
        const widthPct = ((endSec - startSec) / totalSec) * 100;

        const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: false };
        const timeRangeStr = b.start.toLocaleTimeString([], timeOpts) + ' - ' +
          b.end.toLocaleTimeString([], timeOpts);

        rowHtml += `<div class="gantt-bar" style="left: ${leftPct}%; width: ${widthPct}%;">
                            <div class="gantt-tooltip">${timeRangeStr}</div>
                          </div>`;
      }

      totalSeconds += dailySeconds;
      const hrs = Math.floor(dailySeconds / 3600);
      const mins = Math.floor((dailySeconds % 3600) / 60);
      const durationStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

      rowHtml += `</div><div class="gantt-duration" style="width: 50px; text-align: right; font-size: 13px; color: var(--text-main); font-weight: 500; margin-left: 12px; white-space: nowrap;">${durationStr}</div></div>`;
      html += rowHtml;
    }

    if (sortedDays.length === 0) {
      html = `<div style="text-align:center; padding: 20px; color:var(--text-muted);">${getLbl('pc_history_empty', 'Kayıt bulunamadı.')}</div>`;
    } else {
      const tHrs = Math.floor(totalSeconds / 3600);
      const tMins = Math.floor((totalSeconds % 3600) / 60);
      const totalStr = `${String(tHrs).padStart(2, '0')}:${String(tMins).padStart(2, '0')}`;

      const avgSeconds = totalSeconds / sortedDays.length;
      const aHrs = Math.floor(avgSeconds / 3600);
      const aMins = Math.floor((avgSeconds % 3600) / 60);
      const avgStr = `${String(aHrs).padStart(2, '0')}:${String(aMins).padStart(2, '0')}`;

      const totalLbl = window.currentLang === 'en' ? 'Total Uptime (Last 1 Month)' : 'Toplam Açık Süre (Son 1 Ay)';
      const avgLbl = window.currentLang === 'en' ? 'Daily Average' : 'Günlük Ortalama Süre';

      html += `
            <div class="gantt-footer" style="text-align: right; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--panel-border); display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 14px; color: var(--text-muted);"><span style="color:var(--text-main); font-weight:600;">${totalLbl}:</span> ${totalStr}</div>
                <div style="font-size: 14px; color: var(--text-muted);"><span style="color:var(--text-main); font-weight:600;">${avgLbl}:</span> ${avgStr}</div>
            </div>
          `;
    }

    container.innerHTML = html;
    loading.style.display = 'none';
    content.classList.remove('hidden');

    // Translate footer labels if they were hardcoded in loop
    const totalLblEl = container.querySelector('.gantt-footer div:first-child span');
    const avgLblEl = container.querySelector('.gantt-footer div:last-child span');
    if (totalLblEl) totalLblEl.innerText = currentDictionary.pc_history_total_title || 'Total:';
    if (avgLblEl) avgLblEl.innerText = currentDictionary.pc_history_avg_title || 'Average:';
  }

  // --- Shutdown Scheduler Logic ---
  const subViewShutdown = document.getElementById('subview-shutdown');
  let shutdownCaller = 'dashboard';
  
  document.getElementById('btn-open-shutdown').addEventListener('click', () => {
    shutdownCaller = 'dashboard';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    subViewShutdown.classList.add('active');
    checkShutdownState();
  });
  document.getElementById('btn-open-shutdown-tools')?.addEventListener('click', () => {
    shutdownCaller = 'tools';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    subViewShutdown.classList.add('active');
    checkShutdownState();
  });
  document.getElementById('btn-back-shutdown').addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(shutdownCaller).classList.add('active');
  });

  const tabRel = document.getElementById('tab-shut-relative');
  const tabAbs = document.getElementById('tab-shut-absolute');
  const paneRel = document.getElementById('pane-shut-relative');
  const paneAbs = document.getElementById('pane-shut-absolute');

  tabRel.addEventListener('click', () => {
    tabRel.classList.add('active'); tabRel.style.borderBottomColor = 'var(--primary)'; tabRel.style.color = 'var(--primary)';
    tabAbs.classList.remove('active'); tabAbs.style.borderBottomColor = 'transparent'; tabAbs.style.color = 'var(--text-muted)';
    paneRel.classList.remove('hidden'); paneAbs.classList.add('hidden');
  });

  tabAbs.addEventListener('click', () => {
    tabAbs.classList.add('active'); tabAbs.style.borderBottomColor = 'var(--primary)'; tabAbs.style.color = 'var(--primary)';
    tabRel.classList.remove('active'); tabRel.style.borderBottomColor = 'transparent'; tabRel.style.color = 'var(--text-muted)';
    paneAbs.classList.remove('hidden'); paneRel.classList.add('hidden');
  });

  function checkShutdownState() {
    const activeState = localStorage.getItem('shutdownActive');
    const setupView = document.getElementById('shutdown-setup-view');
    const activeView = document.getElementById('shutdown-active-view');

    if (window.shutdownInterval) {
      clearInterval(window.shutdownInterval);
      window.shutdownInterval = null;
    }

    if (activeState && parseInt(activeState) > Date.now()) {
      setupView.classList.add('hidden');
      activeView.classList.remove('hidden');
      
      const updateUI = () => {
        const now = Date.now();
        const targetTime = parseInt(activeState);
        const remainingMs = targetTime - now;

        if (remainingMs <= 0) {
          setupView.classList.remove('hidden');
          activeView.classList.add('hidden');
          localStorage.removeItem('shutdownActive');
          if (window.shutdownInterval) clearInterval(window.shutdownInterval);
          return;
        }

        const targetDate = new Date(targetTime);
        const nowDate = new Date();
        
        const timeStr = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const isTomorrow = targetDate.getDate() !== nowDate.getDate() || targetDate.getMonth() !== nowDate.getMonth();
        const dayText = isTomorrow ? (currentDictionary.shut_tomorrow || 'Yarın') : (currentDictionary.shut_today || 'Bugün');
        
        const remainingSecs = Math.floor(remainingMs / 1000);
        const remainingMins = Math.floor(remainingSecs / 60);
        
        let countdownStr = '';
        if (remainingMins >= 60) {
          const h = Math.floor(remainingMins / 60);
          const m = remainingMins % 60;
          const h_str = currentDictionary.shut_hour || 'Saat';
          const m_str = currentDictionary.shut_min_short || 'Dakika';
          countdownStr = `${h} ${h_str} ${m} ${m_str}`;
        } else {
          const m = remainingMins;
          const s = remainingSecs % 60;
          const m_str = currentDictionary.shut_min_short || 'Dakika';
          const s_str = currentDictionary.shut_sec || 'Saniye';
          countdownStr = `${m} ${m_str} ${s} ${s_str}`;
        }

        activeView.querySelector('#shut-active-text').innerHTML = `
          <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); padding: 8px 18px; border-radius: 20px; font-size: 14px; font-weight: 600; color: #fff; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>
            ${dayText} ${timeStr}
          </div>
          <div style="font-size:38px; font-weight:800; color:#fff; text-shadow: 0 0 20px rgba(0, 210, 255, 0.5); margin-top:24px; font-variant-numeric: tabular-nums; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
            ${countdownStr}
          </div>
        `;
      };

      updateUI();
      window.shutdownInterval = setInterval(updateUI, 1000);
    } else {
      setupView.classList.remove('hidden');
      activeView.classList.add('hidden');
      localStorage.removeItem('shutdownActive');
    }
  }

  document.getElementById('btn-set-shutdown').addEventListener('click', async () => {
    let seconds = 0;
    if (!paneRel.classList.contains('hidden')) {
      const hrs = parseInt(document.getElementById('shut-hrs').value) || 0;
      const mins = parseInt(document.getElementById('shut-mins').value) || 0;
      seconds = (hrs * 3600) + (mins * 60);
      if (seconds <= 0) return showToast('Lütfen sıfırdan büyük bir süre girin.', 'error');
    } else {
      const timeStr = document.getElementById('shut-time').value;
      if (!timeStr) return showToast('Lütfen geçerli bir saat seçin.', 'error');
      const [h, m] = timeStr.split(':').map(Number);
      const now = new Date();
      let target = new Date();
      target.setHours(h, m, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      seconds = Math.floor((target - now) / 1000);
    }

    if (window.electronAPI) {
      const res = await window.electronAPI.scheduleShutdown(seconds);
      if (res.success) {
        const triggerTime = Date.now() + (seconds * 1000);
        localStorage.setItem('shutdownActive', triggerTime.toString());
        checkShutdownState();
        showToast('Kapatma başarıyla zamanlandı!', 'success');
      } else {
        showToast('Zamanlama başarısız: ' + res.message, 'error');
      }
    }
  });

  document.getElementById('btn-cancel-shutdown').addEventListener('click', async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.cancelShutdown();
      if (res.success) {
        localStorage.removeItem('shutdownActive');
        checkShutdownState();
        showToast('Zamanlanmış kapatma iptal edildi.', 'success');
      } else {
        showToast('İptal başarısız: ' + res.message, 'error');
      }
    }
  });

  // --- Restore Point Logic ---
  const btnCreateRestore = document.getElementById('btn-create-restore');
  const toggleRestoreHelp = document.getElementById('toggle-restore-help');
  const restoreHelpContent = document.getElementById('restore-help-content');
  const restoreHelpIcon = document.getElementById('restore-help-icon');

  if (btnCreateRestore) {
    btnCreateRestore.addEventListener('click', async () => {
      if (window.electronAPI) {
        const originalText = btnCreateRestore.innerText;
        btnCreateRestore.innerText = currentDictionary.msg_creating_restore || '...';
        btnCreateRestore.disabled = true;

        showToast('msg_uac_info', 'info');
        const res = await window.electronAPI.createRestorePoint();

        showToast(res.message, res.success ? 'success' : 'error');
        btnCreateRestore.innerText = originalText;
        btnCreateRestore.disabled = false;
      } else {
        showToast('msg_api_not_found', 'error');
      }
    });
  }

  if (toggleRestoreHelp) {
    toggleRestoreHelp.addEventListener('click', () => {
      const isHidden = restoreHelpContent.classList.contains('hidden');
      if (isHidden) {
        restoreHelpContent.classList.remove('hidden');
        restoreHelpIcon.innerText = '▲';
      } else {
        restoreHelpContent.classList.add('hidden');
        restoreHelpIcon.innerText = '▼';
      }
    });
  }

  // --- Tweaks Sub-System Logic ---
  const subViewTweaks = document.getElementById('subview-tweaks');
  // subViewRam is already declared earlier
  const subViewShredWarning = document.getElementById('subview-shredder-warning');
  const subViewShredProgress = document.getElementById('subview-shredder-progress');
  const subViewShredResult = document.getElementById('subview-shredder-result');
  // btnBackRam is already declared earlier
  const btnOpenTweaks = document.getElementById('btn-open-tweaks');
  const btnBackTweaks = document.getElementById('btn-back-tweaks');

  if (btnOpenTweaks) {
    btnOpenTweaks.addEventListener('click', async () => {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      subViewTweaks.classList.add('active');
      checkDebloatStatus();
      if (window.electronAPI) {
        const tweakIds = [
          'tweak-disable-nagle', 'tweak-disable-network-throttle',
          'tweak-system-responsiveness', 'tweak-disable-gamedvr',
          'tweak-classic-context', 'tweak-remove-bing', 'tweak-show-hidden',
          'tweak-verbose-status', 'tweak-disable-lock-screen'
        ];
        
        const statuses = await window.electronAPI.getAllTweakStatuses(tweakIds);
        
        for (const tId of tweakIds) {
          const isEnabled = statuses[tId] || false;
          const checkbox = document.getElementById(tId);
          if (checkbox) {
            checkbox.checked = isEnabled;

            // Clone node to remove existing listeners to avoid multi-triggering on re-opens
            const newCb = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCb, checkbox);

            newCb.addEventListener('change', async (e) => {
              const state = e.target.checked;
              const res = await window.electronAPI.applyTweak(tId, state);
              showToast(res.message, res.success ? 'success' : 'error');
              if (!res.success) {
                e.target.checked = !state; // Revert visually on fail or cancel
              }
            });
          }
        }
      }
    });
  }

  async function checkDebloatStatus() {
    if (!window.electronAPI) return;
    const status = await window.electronAPI.checkDebloatStatus();
    
    if (btnUninstallEdge) {
      if (!status.edgeInstalled) {
        const span = btnUninstallEdge.querySelector('[data-i18n]');
        if (span) span.innerText = currentDictionary.debloat_not_installed || 'Not installed';
        btnUninstallEdge.disabled = true;
        btnUninstallEdge.style.opacity = '0.6';
        btnUninstallEdge.style.cursor = 'not-allowed';
      } else {
        const span = btnUninstallEdge.querySelector('[data-i18n]');
        if (span) span.innerText = currentDictionary.btn_edge || 'Uninstall Edge';
        btnUninstallEdge.disabled = false;
        btnUninstallEdge.style.opacity = '1';
        btnUninstallEdge.style.cursor = 'pointer';
      }
    }

    if (btnUninstallOnedrive) {
      if (!status.onedriveInstalled) {
        const span = btnUninstallOnedrive.querySelector('[data-i18n]');
        if (span) span.innerText = currentDictionary.debloat_not_installed || 'Not installed';
        btnUninstallOnedrive.disabled = true;
        btnUninstallOnedrive.style.opacity = '0.6';
        btnUninstallOnedrive.style.cursor = 'not-allowed';
      } else {
        const span = btnUninstallOnedrive.querySelector('[data-i18n]');
        if (span) span.innerText = currentDictionary.btn_od || 'Remove OneDrive';
        btnUninstallOnedrive.disabled = false;
        btnUninstallOnedrive.style.opacity = '1';
        btnUninstallOnedrive.style.cursor = 'pointer';
      }
    }
  }

  if (btnBackTweaks) {
    btnBackTweaks.addEventListener('click', () => {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('tools').classList.add('active');
    });
  }

  const btnUninstallEdge = document.getElementById('btn-uninstall-edge');
  if (btnUninstallEdge) {
    btnUninstallEdge.addEventListener('click', async () => {
      if (!confirm(currentDictionary.msg_edge_confirm || 'Microsoft Edge will be removed. Are you sure?')) return;
      showToast('msg_uninstalling', 'info');
      if (window.electronAPI) {
        const res = await window.electronAPI.runDebloatAction('btn-uninstall-edge');
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) checkDebloatStatus();
      }
    });
  }

  const btnUninstallOnedrive = document.getElementById('btn-uninstall-onedrive');
  if (btnUninstallOnedrive) {
    btnUninstallOnedrive.addEventListener('click', async () => {
      if (!confirm(currentDictionary.msg_od_confirm || 'OneDrive will be removed. Are you sure?')) return;
      showToast('msg_uninstalling', 'info');
      if (window.electronAPI) {
        const res = await window.electronAPI.runDebloatAction('btn-uninstall-onedrive');
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) checkDebloatStatus();
      }
    });
  }

  // Shredder Logic
  const btnShred = document.getElementById('btn-shred');
  const btnShredCancel = document.getElementById('btn-shred-cancel');
  const btnShredConfirm = document.getElementById('btn-shred-confirm');
  const btnShredDone = document.getElementById('btn-shred-done');
  
  if (btnShred) {
    btnShred.addEventListener('click', () => {
      openSub(subViewShredWarning);
    });
  }

  if (btnShredCancel) {
    btnShredCancel.addEventListener('click', () => {
      closeSub(subViewShredWarning);
    });
  }

  if (btnShredConfirm) {
    btnShredConfirm.addEventListener('click', async () => {
      if (window.electronAPI) {
        const type = await window.electronAPI.showShredMenu();
        if (!type) return;

        const res = await window.electronAPI.shredFile(type);
        if (res.success) {
          // Success state handled by onShredProgress and final result
        } else if (!res.cancel) {
          showToast(res.message || 'Error occurred', 'error');
          closeSub(subViewShredWarning);
        }
      }
    });
  }

  if (window.electronAPI) {
    window.electronAPI.onShredProgress((data) => {
      // Switch view on first progress if not already there
      if (!subViewShredProgress.classList.contains('active')) {
        openSub(subViewShredProgress);
        // Also close the warning subview if it's open
        closeSub(subViewShredWarning);
      }
      
      const fill = document.getElementById('shred-gauge-fill');
      const valText = document.getElementById('shred-gauge-value');
      const fileText = document.getElementById('shred-filename');
      
      if (fill && valText) {
        const offset = 628 - (628 * data.percent) / 100;
        fill.style.strokeDashoffset = offset;
        valText.innerText = data.percent + '%';
      }
      if (fileText && data.fileName) {
        fileText.innerText = data.fileName;
      }

      if (data.percent === 100) {
        setTimeout(() => {
          openSub(subViewShredResult);
        }, 800);
      }
    });
  }

  if (btnShredDone) {
    btnShredDone.addEventListener('click', () => {
      closeSub(subViewShredResult);
      closeSub(subViewShredProgress);
    });
  }

  // --- Desktop Layout Manager Logic ---
  const subViewDesktopLayouts = document.getElementById('subview-desktop-layouts');
  const btnOpenDesktopLayout = document.getElementById('btn-open-desktop-layout');
  const btnBackDesktopLayout = document.getElementById('btn-back-desktop-layout');
  const desktopLayoutList = document.getElementById('desktop-layout-list');
  const desktopLayoutNameInput = document.getElementById('desktop-layout-name');
  const btnSaveDesktopLayout = document.getElementById('btn-save-desktop-layout');

  if (btnOpenDesktopLayout) {
    btnOpenDesktopLayout.addEventListener('click', async () => {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      subViewDesktopLayouts.classList.add('active');
      await refreshDesktopLayouts();
    });
  }

  if (btnBackDesktopLayout) {
    btnBackDesktopLayout.addEventListener('click', () => {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('tools').classList.add('active');
    });
  }

  async function refreshDesktopLayouts() {
    if (!desktopLayoutList || !window.electronAPI) return;
    desktopLayoutList.innerHTML = '<div style="color:var(--text-muted); text-align:center;">Yükleniyor...</div>';
    
    try {
      const layouts = await window.electronAPI.getDesktopLayouts();
      desktopLayoutList.innerHTML = '';
      const keys = Object.keys(layouts);
      if (keys.length === 0) {
        desktopLayoutList.innerHTML = '<div style="color:var(--text-muted); text-align:center;" data-i18n="dl_no_layout">Henüz kaydedilmiş bir düzen yok.</div>';
        if (typeof applyTranslations === 'function') applyTranslations();
        return;
      }
      
      keys.forEach(key => {
        const layout = layouts[key];
        const dateStr = new Date(layout.createdAt).toLocaleString();
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:12px;';
            let subtitleInfo = `${layout.icons.length} simge`;
            if (layout.monitorInfo) {
              const monitorLabel = (typeof currentDictionary !== 'undefined' && currentDictionary['dl_monitors']) ? currentDictionary['dl_monitors'] : 'Monitör';
              subtitleInfo += ` | ${layout.monitorInfo.count} ${monitorLabel} (${layout.monitorInfo.resolutions.join(', ')})`;
            }
            
            div.innerHTML = `
              <div>
                <div style="font-weight:600; font-size:16px; margin-bottom:4px;">${key}</div>
                <div style="font-size:12px; color:var(--text-muted);">${subtitleInfo} | ${dateStr}</div>
              </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-restore-layout" data-name="${key}" style="padding:8px 16px; font-size:13px; background:var(--primary); border:none;" data-i18n="dl_restore_btn">Yükle</button>
            <button class="btn btn-danger btn-delete-layout" data-name="${key}" style="padding:8px 16px; font-size:13px;" data-i18n="dl_delete_btn">Sil</button>
          </div>
        `;
        desktopLayoutList.appendChild(div);
      });

      if (typeof applyTranslations === 'function') applyTranslations();

      document.querySelectorAll('.btn-restore-layout').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const name = e.target.getAttribute('data-name');
          e.target.innerText = '⏳';
          e.target.disabled = true;
          const res = await window.electronAPI.restoreDesktopLayout(name);
          e.target.disabled = false;
          if (res.success) {
            showToast('Düzen başarıyla yüklendi!');
            refreshDesktopLayouts();
          } else {
            showToast('Hata: ' + res.message, 'error');
            refreshDesktopLayouts();
          }
        });
      });

      document.querySelectorAll('.btn-delete-layout').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const name = e.target.getAttribute('data-name');
          const res = await window.electronAPI.deleteDesktopLayout(name);
          if (res.success) {
            showToast('Düzen silindi.');
            refreshDesktopLayouts();
          } else {
            showToast('Hata: ' + res.message, 'error');
          }
        });
      });
    } catch (e) {
      desktopLayoutList.innerHTML = '<div style="color:red; text-align:center;">' + e.message + '</div>';
    }
  }

  if (btnSaveDesktopLayout) {
    btnSaveDesktopLayout.addEventListener('click', async () => {
      const name = desktopLayoutNameInput.value.trim();
      if (!name) {
        showToast('Lütfen bir isim girin.', 'error');
        return;
      }
      if (!window.electronAPI) return;
      btnSaveDesktopLayout.innerText = '⏳';
      btnSaveDesktopLayout.disabled = true;
      const res = await window.electronAPI.saveDesktopLayout(name);
      btnSaveDesktopLayout.innerText = currentDictionary['dl_save_btn'] || 'Mevcut Düzeni Kaydet';
      btnSaveDesktopLayout.disabled = false;
      if (res.success) {
        showToast('Masaüstü düzeni kaydedildi!');
        desktopLayoutNameInput.value = '';
        refreshDesktopLayouts();
      } else {
        showToast('Hata: ' + res.message, 'error');
      }
    });
  }
  // --- Folder Compressor Logic ---
  const subViewFolderCompressor = document.getElementById('subview-folder-compressor');
  const btnOpenFolderCompressor = document.getElementById('btn-open-folder-compressor');
  const btnBackFolderCompressor = document.getElementById('btn-back-folder-compressor');

  const btnFcSelectFolder = document.getElementById('btn-fc-select-folder');
  const fcSelectedFolderContainer = document.getElementById('fc-selected-folder-container');
  const fcFolderName = document.getElementById('fc-folder-name');
  const fcFolderPath = document.getElementById('fc-folder-path');
  
  const fcStatsName = document.getElementById('fc-stats-name');
  const fcStatsPath = document.getElementById('fc-stats-path');
  const fcUncompressedSize = document.getElementById('fc-uncompressed-size');
  const fcContainedFiles = document.getElementById('fc-contained-files');
  const fcStatusIndicator = document.getElementById('fc-status-indicator');
  const fcStatusText = document.getElementById('fc-status-text');

  const btnFcCompress = document.getElementById('btn-fc-compress');
  const btnFcUncompress = document.getElementById('btn-fc-uncompress');
  
  const fcProgressContainer = document.getElementById('fc-progress-container');
  const fcProgressBar = document.getElementById('fc-progress-bar');
  const fcProgressPercent = document.getElementById('fc-progress-percent');

  let fcCurrentFolder = null;
  let fcCurrentMode = 'LZX';
  let fcTotalFiles = 0;
  let fcQueue = [];
  try {
    const saved = localStorage.getItem('fcQueue');
    if (saved) fcQueue = JSON.parse(saved);
  } catch(e) {}

  const fcQueueList = document.getElementById('fc-queue-list');
  const fcCompressedSize = document.getElementById('fc-compressed-size');
  const fcSavingsPercent = document.getElementById('fc-savings-percent');

  function resetFcUI() {
    fcCurrentFolder = null;
    fcStatsName.innerHTML = `<span style="opacity:0.5;">...</span>`;
    fcStatsPath.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_stats_path_empty']) ? currentDictionary['fc_stats_path_empty'] : 'Lütfen bir klasör seçin';
    fcUncompressedSize.innerText = '-';
    if(fcCompressedSize) fcCompressedSize.innerText = '-';
    if(fcSavingsPercent) {
      fcSavingsPercent.style.display = 'none';
      fcSavingsPercent.innerText = '-%0';
    }
    fcContainedFiles.innerText = '-';
    fcStatusIndicator.style.background = '#555';
    fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_waiting']) ? currentDictionary['fc_status_waiting'] : 'Awaiting Folder';
    btnFcCompress.disabled = true;
    btnFcUncompress.style.display = 'none';
    fcProgressContainer.style.display = 'none';
  }

  function renderFcQueue() {
    if(!fcQueueList) return;
    fcQueueList.innerHTML = '';
    fcQueue.forEach((folder, idx) => {
      const el = document.createElement('div');
      el.style.padding = '12px 16px';
      el.style.borderRadius = '8px';
      el.style.cursor = 'pointer';
      el.style.transition = 'all 0.2s';
      
      if (fcCurrentFolder === folder.path) {
        el.style.background = 'rgba(0,136,255,0.1)';
        el.style.borderLeft = '3px solid var(--primary)';
      } else {
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderLeft = '3px solid transparent';
      }

      el.addEventListener('mouseenter', () => {
        if(fcCurrentFolder !== folder.path) el.style.background = 'rgba(255,255,255,0.05)';
      });
      el.addEventListener('mouseleave', () => {
        if(fcCurrentFolder !== folder.path) el.style.background = 'rgba(255,255,255,0.02)';
      });

      const textContainer = document.createElement('div');
      textContainer.style.overflow = 'hidden';
      textContainer.style.flex = '1';

      const nameEl = document.createElement('div');
      nameEl.style.fontWeight = '600';
      nameEl.style.fontSize = '14px';
      nameEl.style.marginBottom = '4px';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.innerText = folder.name;

      const pathEl = document.createElement('div');
      pathEl.style.fontSize = '11px';
      pathEl.style.color = 'var(--text-muted)';
      pathEl.style.whiteSpace = 'nowrap';
      pathEl.style.overflow = 'hidden';
      pathEl.style.textOverflow = 'ellipsis';
      pathEl.innerText = folder.path;

      textContainer.appendChild(nameEl);
      textContainer.appendChild(pathEl);

      const removeBtn = document.createElement('div');
      removeBtn.innerHTML = '✕';
      removeBtn.style.color = 'var(--text-muted)';
      removeBtn.style.fontSize = '14px';
      removeBtn.style.padding = '4px 8px';
      removeBtn.style.cursor = 'pointer';
      removeBtn.title = 'Listeden Kaldır';
      removeBtn.addEventListener('mouseenter', () => removeBtn.style.color = '#ff4757');
      removeBtn.addEventListener('mouseleave', () => removeBtn.style.color = 'var(--text-muted)');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fcQueue.splice(idx, 1);
        localStorage.setItem('fcQueue', JSON.stringify(fcQueue));
        if (fcCurrentFolder === folder.path) {
          if(fcQueue.length > 0) selectFolderFromQueue(fcQueue[0]);
          else resetFcUI();
        } else {
          renderFcQueue();
        }
      });

      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'space-between';
      
      el.appendChild(textContainer);
      el.appendChild(removeBtn);

      el.addEventListener('click', () => {
        selectFolderFromQueue(folder);
      });

      fcQueueList.appendChild(el);
    });
  }

  async function selectFolderFromQueue(folder) {
    fcCurrentFolder = folder.path;
    renderFcQueue();
    
    fcStatsName.innerHTML = `${folder.name}`;
    fcStatsPath.innerText = folder.path;
    
    fcUncompressedSize.innerText = '...';
    if(fcCompressedSize) fcCompressedSize.innerText = '...';
    if(fcSavingsPercent) fcSavingsPercent.style.display = 'none';
    fcContainedFiles.innerText = '...';
    
    fcStatusIndicator.style.background = '#eba334';
    fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_analyzing']) ? currentDictionary['fc_status_analyzing'] : 'Analyzing...';
    btnFcCompress.disabled = true;
    btnFcUncompress.style.display = 'none';
    fcProgressContainer.style.display = 'none';

    if (!window.electronAPI) return;
    const stats = await window.electronAPI.fcAnalyzeFolder(folder.path);
    fcTotalFiles = stats.count;
    
    const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
    fcUncompressedSize.innerText = sizeGB > 0.01 ? `${sizeGB} GB` : `${(stats.size / (1024 * 1024)).toFixed(2)} MB`;
    
    if (fcCompressedSize) {
       const compGB = (stats.compressedSize / (1024 * 1024 * 1024)).toFixed(2);
       fcCompressedSize.innerText = compGB > 0.01 ? `${compGB} GB` : `${(stats.compressedSize / (1024 * 1024)).toFixed(2)} MB`;
       
       if (fcSavingsPercent && stats.size > 0) {
         const savings = Math.max(0, 100 - (stats.compressedSize / stats.size * 100)).toFixed(1);
         if (savings > 0) {
           fcSavingsPercent.innerText = `-%${savings}`;
           fcSavingsPercent.style.display = 'inline-block';
         } else {
           fcSavingsPercent.style.display = 'none';
         }
       }
    }

    fcContainedFiles.innerText = stats.count.toLocaleString();
    
    fcStatusIndicator.style.background = '#08a4ff';
    fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_ready']) ? currentDictionary['fc_status_ready'] : 'Awaiting Compression';
    btnFcCompress.disabled = false;
    btnFcUncompress.style.display = 'block';
  }

  if (btnOpenFolderCompressor) {
    btnOpenFolderCompressor.addEventListener('click', () => {
      openSub(subViewFolderCompressor);
      if(fcQueue.length === 0) {
        resetFcUI();
      } else {
        renderFcQueue();
        if(!fcCurrentFolder) selectFolderFromQueue(fcQueue[0]);
      }
    });
  }
  if (btnBackFolderCompressor) {
    btnBackFolderCompressor.addEventListener('click', () => closeSub(subViewFolderCompressor));
  }

  // Mode selection
  document.querySelectorAll('.fc-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.fc-mode-card').forEach(c => {
        c.classList.remove('active');
        c.style.background = 'rgba(255,255,255,0.05)';
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.querySelector('div:last-child').style.color = 'var(--text-muted)';
      });
      card.classList.add('active');
      card.style.background = 'rgba(0,136,255,0.1)';
      card.style.borderColor = 'var(--primary)';
      card.querySelector('div:last-child').style.color = 'var(--primary)';
      fcCurrentMode = card.getAttribute('data-mode');
    });
  });

  if (btnFcSelectFolder) {
    btnFcSelectFolder.addEventListener('click', async () => {
      if (!window.electronAPI) return;
      
      const folderPath = await window.electronAPI.fcSelectFolder();
      if (!folderPath) return;

      const folderName = folderPath.split('\\').pop() || folderPath;
      const newFolder = { name: folderName, path: folderPath };
      
      if (!fcQueue.find(f => f.path === folderPath)) {
        fcQueue.push(newFolder);
        localStorage.setItem('fcQueue', JSON.stringify(fcQueue));
      }
      
      selectFolderFromQueue(newFolder);
    });
  }

  function startFcProgress() {
    btnFcCompress.disabled = true;
    btnFcUncompress.disabled = true;
    btnFcSelectFolder.disabled = true;
    fcProgressContainer.style.display = 'block';
    fcProgressBar.style.width = '0%';
    fcProgressPercent.innerText = '0%';
    fcStatusIndicator.style.background = '#eba334';
    fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_compressing']) ? currentDictionary['fc_status_compressing'] : 'Compressing...';
    
    if (window.electronAPI) {
      window.electronAPI.onFcProgress((data) => {
        if (fcTotalFiles > 0) {
          let percent = Math.min(100, Math.round((data.processedFiles / fcTotalFiles) * 100));
          fcProgressBar.style.width = `${percent}%`;
          fcProgressPercent.innerText = `${percent}%`;
        }
      });
    }
  }

  function endFcProgress(success, message) {
    btnFcCompress.disabled = false;
    btnFcUncompress.disabled = false;
    btnFcSelectFolder.disabled = false;
    
    if (success) {
      fcProgressBar.style.width = '100%';
      fcProgressPercent.innerText = '100%';
      fcStatusIndicator.style.background = 'var(--success)';
      fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_done']) ? currentDictionary['fc_status_done'] : 'Finished';
      showToast((typeof currentDictionary !== 'undefined' && currentDictionary['fc_success_msg']) ? currentDictionary['fc_success_msg'] : 'İşlem başarıyla tamamlandı!');
      
      // Re-analyze after completion
      if (fcCurrentFolder) {
        setTimeout(() => selectFolderFromQueue(fcQueue.find(f => f.path === fcCurrentFolder)), 500);
      }
    } else {
      fcStatusIndicator.style.background = '#ff4757';
      fcStatusText.innerText = 'Error';
      showToast('Hata: ' + message, 'error');
    }
  }

  if (btnFcCompress) {
    btnFcCompress.addEventListener('click', async () => {
      if (!fcCurrentFolder || !window.electronAPI) return;
      startFcProgress();
      const res = await window.electronAPI.fcCompressFolder(fcCurrentFolder, fcCurrentMode, false);
      endFcProgress(res.success, res.message);
    });
  }

  if (btnFcUncompress) {
    btnFcUncompress.addEventListener('click', async () => {
      if (!fcCurrentFolder || !window.electronAPI) return;
      startFcProgress();
      fcStatusText.innerText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_status_uncompressing']) ? currentDictionary['fc_status_uncompressing'] : 'Uncompressing...';
      const res = await window.electronAPI.fcUncompressFolder(fcCurrentFolder);
      endFcProgress(res.success, res.message);
    });
  }

});

  // Updater Logic
  const btnUpdaterAction = document.getElementById('btn-updater-action');
  const updaterStatusText = document.getElementById('updater-status-text');
  const updaterProgressContainer = document.getElementById('updater-progress-container');
  const updaterProgressFill = document.getElementById('updater-progress-fill');
  window.updaterState = 'idle'; // idle, downloading, ready

  // Use a helper function for translation fallback
  const t = (key) => currentDictionary && currentDictionary[key] ? currentDictionary[key] : key;

  if (btnUpdaterAction && window.electronAPI) {
    btnUpdaterAction.addEventListener('click', async () => {
      if (window.updaterState === 'idle') {
        btnUpdaterAction.disabled = true;
        btnUpdaterAction.textContent = t('updater_checking');
        const res = await window.electronAPI.checkForUpdates();
        if (!res.success) {
          window.updaterState = 'idle';
          updaterStatusText.textContent = t('updater_error');
          showToast(t('updater_error'), 'error');
          btnUpdaterAction.disabled = false;
          btnUpdaterAction.textContent = t('updater_check_btn');
        }
      } else if (window.updaterState === 'downloading') {
        // Nothing, disabled
      } else if (window.updaterState === 'ready') {
        window.electronAPI.quitAndInstall();
      }
    });

    window.electronAPI.onUpdaterEvent((data) => {
      if (data.type === 'update-available') {
        window.updaterState = 'downloading';
        updaterStatusText.textContent = t('updater_new_found').replace('{version}', data.info.version);
        updaterProgressContainer.classList.remove('hidden');
        btnUpdaterAction.textContent = t('updater_downloading');
        btnUpdaterAction.disabled = true;
        window.electronAPI.downloadUpdate();
      } else if (data.type === 'update-not-available') {
        updaterStatusText.textContent = t('updater_up_to_date_toast');
        updaterStatusText.style.color = '#00cc99';
        setTimeout(() => {
          updaterStatusText.style.color = '';
          updaterStatusText.innerHTML = `<span data-i18n="updater_version_prefix">${t('updater_version_prefix')}</span> ${window.appVersion ? 'v'+window.appVersion : 'v...'}`;
        }, 4000);
        btnUpdaterAction.disabled = false;
        btnUpdaterAction.textContent = t('updater_check_btn');
        showToast(t('updater_up_to_date_toast'), 'success');
      } else if (data.type === 'download-progress') {
        const percent = Math.round(data.progress.percent);
        updaterProgressFill.style.width = percent + '%';
        updaterStatusText.textContent = t('updater_downloading_progress').replace('{percent}', percent);
      } else if (data.type === 'update-downloaded') {
        window.updaterState = 'ready';
        updaterProgressContainer.classList.add('hidden');
        updaterStatusText.textContent = t('updater_ready');
        btnUpdaterAction.textContent = t('updater_restart_btn');
        btnUpdaterAction.disabled = false;
        btnUpdaterAction.style.background = '#00cc99';
        showToast(t('updater_ready_toast'), 'success');
      } else if (data.type === 'error') {
        window.updaterState = 'idle';
        updaterProgressContainer.classList.add('hidden');
        updaterStatusText.textContent = t('updater_error');
        btnUpdaterAction.disabled = false;
        btnUpdaterAction.textContent = t('updater_check_btn');
        showToast(t('updater_error_toast').replace('{error}', data.error), 'error');
      }
    });
  }
window.addEventListener('DOMContentLoaded', async () => {
  if (window.electronAPI && window.electronAPI.getAppVersion) {
    const v = await window.electronAPI.getAppVersion();
    window.appVersion = v;
    
    const versionNum = document.getElementById('updater-version-number');
    if (versionNum) {
      versionNum.textContent = 'v' + v;
    }
    const sidebarVersionNum = document.getElementById('sidebar-version-number');
    if (sidebarVersionNum) {
      sidebarVersionNum.textContent = 'v' + v;
    }

  }
});
