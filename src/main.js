// main.js - Vanilla JS Logic for UI
import '@fortawesome/fontawesome-free/css/all.min.css';

window.mainViewForwardStack = [];
let currentDictionary = {};
let currentLang = localStorage.getItem('appLang') || (navigator.language.startsWith('tr') ? 'tr' : 'en');

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
      window.mainViewForwardStack = [];
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

    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';

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
                  <div class="hw-icon"><i class="fa-solid fa-network-wired"></i></div>
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_mb">${getLbl('dash_hw_mb', 'Motherboard')}</span>
                    <span class="hw-value" title="${hardware.mb || getLbl('msg_hw_unknown', 'Unknown')}">${hardware.mb || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
                <div class="hw-card">
                  <div class="hw-icon"><i class="fa-solid fa-microchip"></i></div>
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_cpu">${getLbl('dash_hw_cpu', 'Processor')}</span>
                    <span class="hw-value" title="${hardware.cpu || getLbl('msg_hw_unknown', 'Unknown')}">${hardware.cpu || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
              `;

        if (hardware.gpus) {
          hardware.gpus.forEach(gpu => {
            html += `
                <div class="hw-card">
                  <div class="hw-icon"><i class="fa-solid fa-gamepad"></i></div>
                  ${gpu.vramGB && gpu.vramGB > 0 ? `<div class="hw-badge">${gpu.vramGB} GB</div>` : ''}
                  <div class="hw-details">
                    <span class="hw-label" data-i18n="dash_hw_gpu">${getLbl('dash_hw_gpu', 'Graphics')}</span>
                    <span class="hw-value" title="${gpu.name || getLbl('msg_hw_unknown', 'Unknown')}">${gpu.name || getLbl('msg_hw_unknown', 'Unknown')}</span>
                  </div>
                </div>
            `;
          });
        }

        html += `
                <div class="hw-card">
                  <div class="hw-icon"><i class="fa-solid fa-memory"></i></div>
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
                        <div class="hw-icon"><i class="fa-solid fa-hard-drive"></i></div>
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
      } else {
        const svTweaks = document.getElementById('subview-tweaks');
        const svShutdown = document.getElementById('subview-shutdown');
        const svDesktop = document.getElementById('subview-desktop-layouts');
        if (svTweaks && svTweaks.classList.contains('active')) {
          const btn = document.getElementById('btn-back-tweaks');
          if (btn) btn.click();
        } else if (svShutdown && svShutdown.classList.contains('active')) {
          const btn = document.getElementById('btn-back-shutdown');
          if (btn) btn.click();
        } else if (svDesktop && svDesktop.classList.contains('active')) {
          const btn = document.getElementById('btn-back-desktop-layout');
          if (btn) btn.click();
        }
      }
    } else if (e.button === 4) {
      if (forwardStack.length > 0) {
        const nextView = forwardStack.pop();
        viewStack.push(nextView);
        nextView.classList.add('active-sub');
      } else if (window.mainViewForwardStack && window.mainViewForwardStack.length > 0) {
        const btn = window.mainViewForwardStack.pop();
        if (btn) btn.click();
      }
    }
  });

  window.addEventListener('app-command', (e) => {
    if (e.cmd === 'browser-backward') {
      if (viewStack.length > 0) {
        const topView = viewStack[viewStack.length - 1];
        closeSub(topView);
      } else {
        const svTweaks = document.getElementById('subview-tweaks');
        const svShutdown = document.getElementById('subview-shutdown');
        const svDesktop = document.getElementById('subview-desktop-layouts');
        if (svTweaks && svTweaks.classList.contains('active')) {
          const btn = document.getElementById('btn-back-tweaks');
          if (btn) btn.click();
        } else if (svShutdown && svShutdown.classList.contains('active')) {
          const btn = document.getElementById('btn-back-shutdown');
          if (btn) btn.click();
        } else if (svDesktop && svDesktop.classList.contains('active')) {
          const btn = document.getElementById('btn-back-desktop-layout');
          if (btn) btn.click();
        }
      }
    } else if (e.cmd === 'browser-forward') {
      if (forwardStack.length > 0) {
        const nextView = forwardStack.pop();
        viewStack.push(nextView);
        nextView.classList.add('active-sub');
      } else if (window.mainViewForwardStack && window.mainViewForwardStack.length > 0) {
        const btn = window.mainViewForwardStack.pop();
        if (btn) btn.click();
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
    window.mainViewForwardStack.push(document.getElementById(shutdownCaller === 'tools' ? 'btn-open-shutdown-tools' : 'btn-open-shutdown'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(shutdownCaller).classList.add('active');
  });

  const tabRel = document.getElementById('tab-shut-relative');
  const tabAbs = document.getElementById('tab-shut-absolute');
  const tabSmart = document.getElementById('tab-shut-smart');
  const paneRel = document.getElementById('pane-shut-relative');
  const paneAbs = document.getElementById('pane-shut-absolute');
  const paneSmart = document.getElementById('pane-shut-smart');

  tabRel.addEventListener('click', () => {
    tabRel.classList.add('active'); tabRel.style.borderBottomColor = 'var(--primary)'; tabRel.style.color = 'var(--primary)';
    tabAbs.classList.remove('active'); tabAbs.style.borderBottomColor = 'transparent'; tabAbs.style.color = 'var(--text-muted)';
    tabSmart.classList.remove('active'); tabSmart.style.borderBottomColor = 'transparent'; tabSmart.style.color = 'var(--text-muted)';
    paneRel.classList.remove('hidden'); paneAbs.classList.add('hidden'); paneSmart.classList.add('hidden');
  });

  tabAbs.addEventListener('click', () => {
    tabAbs.classList.add('active'); tabAbs.style.borderBottomColor = 'var(--primary)'; tabAbs.style.color = 'var(--primary)';
    tabRel.classList.remove('active'); tabRel.style.borderBottomColor = 'transparent'; tabRel.style.color = 'var(--text-muted)';
    tabSmart.classList.remove('active'); tabSmart.style.borderBottomColor = 'transparent'; tabSmart.style.color = 'var(--text-muted)';
    paneAbs.classList.remove('hidden'); paneRel.classList.add('hidden'); paneSmart.classList.add('hidden');
  });

  tabSmart.addEventListener('click', () => {
    tabSmart.classList.add('active'); tabSmart.style.borderBottomColor = 'var(--primary)'; tabSmart.style.color = 'var(--primary)';
    tabRel.classList.remove('active'); tabRel.style.borderBottomColor = 'transparent'; tabRel.style.color = 'var(--text-muted)';
    tabAbs.classList.remove('active'); tabAbs.style.borderBottomColor = 'transparent'; tabAbs.style.color = 'var(--text-muted)';
    paneSmart.classList.remove('hidden'); paneRel.classList.add('hidden'); paneAbs.classList.add('hidden');
  });

  async function checkShutdownState() {
    const activeState = localStorage.getItem('shutdownActive');
    const setupView = document.getElementById('shutdown-setup-view');
    const activeView = document.getElementById('shutdown-active-view');

    if (window.shutdownInterval) {
      clearInterval(window.shutdownInterval);
      window.shutdownInterval = null;
    }

    if (activeState === 'smart') {
      if (window.electronAPI && window.electronAPI.getSmartShutdownStatus) {
        const isActive = await window.electronAPI.getSmartShutdownStatus();
        if (!isActive) {
           localStorage.removeItem('shutdownActive');
           setupView.classList.remove('hidden');
           activeView.classList.add('hidden');
           return;
        }
      }
      setupView.classList.add('hidden');
      activeView.classList.remove('hidden');
      activeView.querySelector('#shut-active-text').innerHTML = `
          <div style="font-size: 15px; color: var(--text-muted); margin-bottom: 24px; line-height: 1.6;">
            ${currentDictionary.shut_smart_active_desc || 'İndirme hızınız belirlenen şartların altına düştüğünde bilgisayarınız otomatik olarak kapatılacaktır.'}
          </div>
          <div style="background: rgba(46, 213, 115, 0.1); border: 1px solid rgba(46, 213, 115, 0.2); padding: 10px 20px; border-radius: 100px; font-size: 14px; font-weight: 600; color: #2ed573; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(46, 213, 115, 0.1);">
            <i class="fa-solid fa-bolt" style="animation: pulseOpacity 2s infinite;"></i>
            ${currentDictionary.shut_smart_active_title || 'Akıllı İndirme Bekçisi Çalışıyor'}
          </div>
        `;
      return;
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
          <div style="color: var(--text-muted); font-size: 15px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-weight: 500;">
            <i class="fa-regular fa-calendar" style="opacity: 0.7;"></i> ${dayText} ${timeStr}
          </div>
          <div style="font-size: 40px; white-space: nowrap; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -1px; background: linear-gradient(180deg, #ffffff 0%, #a0a5b1 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.4)); line-height: 1;">
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
    if (!paneSmart.classList.contains('hidden')) {
      const mbThreshold = parseFloat(document.getElementById('shut-smart-mb').value) || 0;
      const durationMin = parseInt(document.getElementById('shut-smart-dur').value) || 0;
      const delayMin = parseInt(document.getElementById('shut-smart-delay').value) || 0;
      
      if (mbThreshold < 0 || durationMin <= 0) return showToast('Lütfen geçerli değerler girin.', 'error');
      
      if (window.electronAPI) {
        const res = await window.electronAPI.scheduleSmartShutdown(mbThreshold, durationMin, delayMin);
        if (res.success) {
          localStorage.setItem('shutdownActive', 'smart');
          checkShutdownState();
          showToast('Akıllı kapatma başarıyla başlatıldı!', 'success');
        } else {
          showToast('Başlatma başarısız: ' + res.message, 'error');
        }
      }
      return;
    }

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
        const originalText = btnCreateRestore.innerHTML;
        btnCreateRestore.innerHTML = currentDictionary.msg_creating_restore || '...';
        btnCreateRestore.disabled = true;

        showToast('msg_uac_info', 'info');
        const res = await window.electronAPI.createRestorePoint();

        showToast(res.message, res.success ? 'success' : 'error');
        btnCreateRestore.innerHTML = originalText;
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
      window.mainViewForwardStack.push(document.getElementById('btn-open-tweaks'));
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
      window.mainViewForwardStack.push(document.getElementById('btn-open-desktop-layout'));
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
          e.target.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';
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
      btnSaveDesktopLayout.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';
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
    renderFcQueue();
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
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
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
        setTimeout(async () => {
          await selectFolderFromQueue(fcQueue.find(f => f.path === fcCurrentFolder));
          let history = JSON.parse(localStorage.getItem('fcHistory') || '[]');
          history.push({
             path: fcCurrentFolder,
             originalSize: fcUncompressedSize.innerText,
             compressedSize: fcCompressedSize ? fcCompressedSize.innerText : '-',
             savings: fcSavingsPercent ? fcSavingsPercent.innerText : '',
             algorithm: fcCurrentMode,
             date: new Date().toLocaleString()
          });
          localStorage.setItem('fcHistory', JSON.stringify(history));
          if(typeof renderFcHistory === 'function') renderFcHistory();
        }, 500);
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


  // --- Folder Compressor History ---
  const subViewFcHistory = document.getElementById('subview-fc-history');
  const btnOpenFcHistory = document.getElementById('btn-open-fc-history');
  const btnBackFcHistory = document.getElementById('btn-back-fc-history');
  const btnClearFcHistory = document.getElementById('btn-clear-fc-history');
  const fcHistoryList = document.getElementById('fc-history-list');

  if (btnOpenFcHistory && subViewFcHistory) {
    btnOpenFcHistory.addEventListener('click', () => {
      openSub(subViewFcHistory);
      renderFcHistory();
    });

    btnBackFcHistory.addEventListener('click', () => {
      closeSub(subViewFcHistory);
    });

    btnClearFcHistory.addEventListener('click', () => {
      localStorage.removeItem('fcHistory');
      renderFcHistory();
    });
  }

  function renderFcHistory() {
    if (!fcHistoryList) return;
    const history = JSON.parse(localStorage.getItem('fcHistory') || '[]');
    fcHistoryList.innerHTML = '';
    
    if (history.length === 0) {
      const emptyText = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_history_empty']) ? currentDictionary['fc_history_empty'] : 'Henüz klasör sıkıştırmadınız. Geçmiş tertemiz!';
      fcHistoryList.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:40px;"><i class="fa-solid fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i><p>${emptyText}</p></div>`;
      return;
    }
    
    // Reverse to show newest first
    [...history].reverse().forEach(item => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.padding = '20px';
      card.style.borderRadius = '12px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '12px';

      const tOrig = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_history_original']) ? currentDictionary['fc_history_original'] : 'Gerçek Boyut';
      const tComp = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_history_compressed']) ? currentDictionary['fc_history_compressed'] : 'Sıkıştırılmış Boyut';
      const tAlgo = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_history_algorithm']) ? currentDictionary['fc_history_algorithm'] : 'Algoritma';
      const tDate = (typeof currentDictionary !== 'undefined' && currentDictionary['fc_history_date']) ? currentDictionary['fc_history_date'] : 'Tarih';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1; overflow:hidden;">
            <h3 style="margin:0; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.path}">${item.path}</h3>
            <span style="font-size:12px; color:var(--text-muted);">${tDate}: ${item.date}</span>
          </div>
          <div style="background:rgba(0,136,255,0.1); color:var(--primary); padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">
            ${tAlgo}: ${item.algorithm}
          </div>
        </div>
        <div style="display:flex; gap:24px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
          <div><span style="color:var(--text-muted); font-size:12px;">${tOrig}</span><br><b style="font-size:14px;">${item.originalSize}</b></div>
          <div><span style="color:var(--text-muted); font-size:12px;">${tComp}</span><br><b style="font-size:14px; color:var(--primary);">${item.compressedSize} ${item.savings}</b></div>
        </div>
      `;
      fcHistoryList.appendChild(card);
    });
  }

  // -------------------------------------------------------------
  // Task Scheduler Logic
  // -------------------------------------------------------------
  const btnOpenTaskScheduler = document.getElementById('btn-open-task-scheduler');
  const btnBackTaskScheduler = document.getElementById('btn-back-task-scheduler');
  const subviewTaskScheduler = document.getElementById('subview-task-scheduler');
  
  if (btnOpenTaskScheduler && subviewTaskScheduler && btnBackTaskScheduler) {
    btnOpenTaskScheduler.addEventListener('click', () => {
      openSub(subviewTaskScheduler);
      loadTsTasks();
    });
    
    btnBackTaskScheduler.addEventListener('click', () => {
      closeSub(subviewTaskScheduler);
    });
  }

  const tsTriggerType = document.getElementById('ts-trigger-type');
  const tsTimeContainer = document.getElementById('ts-time-container');
  // btnTsSelectFile removed
  const tsFilePath = document.getElementById('ts-file-path');
  const btnTsCreate = document.getElementById('btn-ts-create');
  
  if (tsTriggerType) {
    tsTriggerType.addEventListener('change', () => {
      if (tsTriggerType.value === 'DAILY' || tsTriggerType.value === 'WEEKLY') {
        tsTimeContainer.style.display = 'block';
      } else {
        tsTimeContainer.style.display = 'none';
      }
    });
  }

  if (tsFilePath && window.electronAPI) {
    tsFilePath.addEventListener('click', async () => {
      const result = await window.electronAPI.tsSelectFile();
      if (result) {
        tsFilePath.value = result;
      }
    });
  }

  if (btnTsCreate && window.electronAPI) {
    btnTsCreate.addEventListener('click', async () => {
      const name = document.getElementById('ts-task-name').value.trim();
      const filePath = tsFilePath.value.trim();
      const triggerType = tsTriggerType.value;
      const time = document.getElementById('ts-time').value;

      if (!name || !filePath) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      btnTsCreate.disabled = true;
      btnTsCreate.textContent = '...';

      const res = await window.electronAPI.tsCreateTask({ name, filePath, triggerType, time });
      if (res && res.success) {
        showToast(t('ts_toast_created'), 'success');
        document.getElementById('ts-task-name').value = '';
        tsFilePath.value = '';
        loadTsTasks();
      } else {
        showToast(t('ts_toast_error').replace('{error}', res?.error || 'Unknown'), 'error');
      }

      btnTsCreate.disabled = false;
      btnTsCreate.textContent = t('ts_btn_save');
    });
  }

  window.deleteTsTask = async (taskName) => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.tsDeleteTask(taskName);
    if (res && res.success) {
      showToast(t('ts_toast_deleted'), 'success');
      loadTsTasks();
    } else {
      showToast(t('ts_toast_error').replace('{error}', res?.error || 'Unknown'), 'error');
    }
  };

  window.runTsTask = async (taskName) => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.tsRunTask(taskName);
    if (res && res.success) {
      showToast(t('ts_toast_run'), 'success');
    } else {
      showToast(t('ts_toast_error').replace('{error}', res?.error || 'Unknown'), 'error');
    }
  };

  async function loadTsTasks() {
    if (!window.electronAPI) return;
    const listContainer = document.getElementById('ts-list-container');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted);">...</div>';

    const res = await window.electronAPI.tsListTasks();
    if (!res || !res.success || !res.data || res.data.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:14px;" data-i18n="ts_no_tasks">${t('ts_no_tasks')}</div>`;
      return;
    }

    let html = '';
    const getT = (key, fallback) => (window.appTranslations && window.appTranslations[key]) ? window.appTranslations[key] : fallback;

    for (const task of res.data) {
      // Translate Status
      let displayStatus = task.status;
      if (displayStatus.toLowerCase() === 'ready') displayStatus = getT('ts_status_ready', 'Hazır');
      else if (displayStatus.toLowerCase() === 'running') displayStatus = getT('ts_status_running', 'Çalışıyor');
      else if (displayStatus.toLowerCase() === 'disabled') displayStatus = getT('ts_status_disabled', 'Devre Dışı');
      
      // Translate Trigger
      let displayTrigger = task.scheduleType || '';
      if (displayTrigger.toLowerCase().includes('daily')) displayTrigger = getT('ts_trigger_type_daily', 'Her gün');
      else if (displayTrigger.toLowerCase().includes('weekly')) displayTrigger = getT('ts_trigger_type_weekly', 'Her hafta');
      else if (displayTrigger.toLowerCase().includes('logon')) displayTrigger = getT('ts_trigger_type_logon', 'Oturum açıldığında');
      else if (displayTrigger.toLowerCase().includes('startup') || displayTrigger.toLowerCase().includes('start up')) displayTrigger = getT('ts_trigger_type_startup', 'Açılışta');
      
      if (task.startTime && task.startTime !== 'N/A' && task.startTime !== '') {
        displayTrigger += ` (${task.startTime.substring(0, 5)})`;
      }

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:16px;">
          <div>
            <div style="font-weight:600; font-size:15px; color:var(--text-main); margin-bottom:6px;">${task.taskName.replace(/^UToolbox_/, '')}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px;">
              <span style="color:var(--primary); font-weight:500;" data-i18n="ts_next_run">${getT('ts_next_run', 'Sonraki Çalışma:')}</span> ${task.nextRunTime} 
              <span style="margin: 0 6px;">|</span> 
              <span style="color:#00f2fe; font-weight:500;" data-i18n="ts_status">${getT('ts_status', 'Durum:')}</span> ${displayStatus}
              ${displayTrigger ? `<span style="margin: 0 6px;">|</span> <span style="color:#00f2fe; font-weight:500;" data-i18n="ts_trigger_label">${getT('ts_trigger_label', 'Tetikleyici:')}</span> ${displayTrigger}` : ''}
            </div>
            <div style="font-size:12px; color:var(--text-muted); font-family:monospace; background:rgba(0,0,0,0.2); padding:4px 8px; border-radius:4px; margin-top:6px; display:inline-block; max-width:500px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${task.taskToRun.replace(/"/g, '&quot;')}">
              ${task.taskToRun}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; white-space:nowrap;" onclick="runTsTask('${task.taskName}')" data-i18n="ts_btn_run_now">${getT('ts_btn_run_now', 'Şimdi Çalıştır')}</button>
            <button class="btn btn-danger" style="font-size:12px; padding:6px 12px; white-space:nowrap;" onclick="deleteTsTask('${task.taskName}')" data-i18n="ts_btn_delete">${getT('ts_btn_delete', 'Sil')}</button>
          </div>
        </div>
      `;
    }
    listContainer.innerHTML = html;
  }

  // --- Quick App Installer (Winget) ---
const btnOpenQuickInstall = document.getElementById('btn-open-quick-install');
const btnBackQuickInstall = document.getElementById('btn-back-quick-install');
const subviewQuickInstall = document.getElementById('subview-quick-install');

const curatedApps = [
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'cat_browsers' },
  { id: 'Mozilla.Firefox', name: 'Mozilla Firefox', category: 'cat_browsers' },
  { id: 'Brave.Brave', name: 'Brave', category: 'cat_browsers' },
  { id: 'Opera.Opera', name: 'Opera', category: 'cat_browsers' },
  { id: 'VivaldiTechnologies.Vivaldi', name: 'Vivaldi', category: 'cat_browsers' },
  
  { id: 'Discord.Discord', name: 'Discord', category: 'cat_social' },
  { id: 'Zoom.Zoom', name: 'Zoom', category: 'cat_social' },
  { id: 'SlackTechnologies.Slack', name: 'Slack', category: 'cat_social' },
  { id: 'Microsoft.Teams', name: 'Microsoft Teams', category: 'cat_social' },
  { id: 'Telegram.TelegramDesktop', name: 'Telegram', category: 'cat_social' },
  { id: 'WhatsApp.WhatsApp', name: 'WhatsApp', category: 'cat_social' },
  { id: 'Mozilla.Thunderbird', name: 'Thunderbird', category: 'cat_social' },

  { id: 'Valve.Steam', name: 'Steam', category: 'cat_games' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games', category: 'cat_games' },
  { id: 'GOG.Galaxy', name: 'GOG Galaxy', category: 'cat_games' },
  { id: 'ElectronicArts.EADesktop', name: 'EA app', category: 'cat_games' },
  { id: 'Ubisoft.Connect', name: 'Ubisoft Connect', category: 'cat_games' },
  { id: 'Blizzard.BattleNet', name: 'Battle.net', category: 'cat_games' },

  { id: 'Spotify.Spotify', name: 'Spotify', category: 'cat_media' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'cat_media' },
  { id: 'CodecGuide.K-LiteCodecPack.Standard', name: 'K-Lite Codec Pack', category: 'cat_media' },
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'cat_media' },
  { id: 'ShareX.ShareX', name: 'ShareX', category: 'cat_media' },
  { id: 'GIMP.GIMP', name: 'GIMP', category: 'cat_media' },
  { id: 'dotPDN.PaintDotNet', name: 'Paint.NET', category: 'cat_media' },
  { id: 'Audacity.Audacity', name: 'Audacity', category: 'cat_media' },
  { id: 'Figma.Figma', name: 'Figma', category: 'cat_media' },
  { id: 'BlenderFoundation.Blender', name: 'Blender', category: 'cat_media' },

  { id: 'voidtools.Everything', name: 'Everything', category: 'cat_tools' },
  { id: '7zip.7zip', name: '7-Zip', category: 'cat_tools' },
  { id: 'RARLab.WinRAR', name: 'WinRAR', category: 'cat_tools' },
  { id: 'GeekUninstaller.GeekUninstaller', name: 'Geek Uninstaller', category: 'cat_tools' },
  { id: 'Microsoft.PowerToys', name: 'PowerToys', category: 'cat_tools' },
  { id: 'Rufus.Rufus', name: 'Rufus', category: 'cat_tools' },
  { id: 'AnyDeskSoftwareGmbH.AnyDesk', name: 'AnyDesk', category: 'cat_tools' },
  { id: 'TeamViewer.TeamViewer', name: 'TeamViewer', category: 'cat_tools' },
  { id: 'qBittorrent.qBittorrent', name: 'qBittorrent', category: 'cat_tools' },

  { id: 'Notepad++.Notepad++', name: 'Notepad++', category: 'cat_dev' },
  { id: 'Microsoft.VisualStudioCode', name: 'VS Code', category: 'cat_dev' },
  { id: 'Git.Git', name: 'Git', category: 'cat_dev' },
  { id: 'GitHub.GitHubDesktop', name: 'GitHub Desktop', category: 'cat_dev' },
  { id: 'Termius.Termius', name: 'Termius', category: 'cat_dev' },
  { id: 'Docker.DockerDesktop', name: 'Docker Desktop', category: 'cat_dev' },
  { id: 'OpenJS.NodeJS', name: 'Node.js', category: 'cat_dev' },
  { id: 'Python.Python.3.12', name: 'Python 3.12', category: 'cat_dev' },

  { id: 'Notion.Notion', name: 'Notion', category: 'cat_cloud' },
  { id: 'Obsidian.Obsidian', name: 'Obsidian', category: 'cat_cloud' },
  { id: 'Google.GoogleDrive', name: 'Google Drive', category: 'cat_cloud' },
  { id: 'Dropbox.Dropbox', name: 'Dropbox', category: 'cat_cloud' },
  { id: 'TheDocumentFoundation.LibreOffice', name: 'LibreOffice', category: 'cat_cloud' },

  { id: 'Bitwarden.Bitwarden', name: 'Bitwarden', category: 'cat_security' },
  { id: 'Malwarebytes.Malwarebytes', name: 'Malwarebytes', category: 'cat_security' },
  { id: 'ProtonTechnologies.ProtonVPN', name: 'Proton VPN', category: 'cat_security' },
  { id: 'Cloudflare.Warp', name: 'Cloudflare WARP', category: 'cat_security' }
];

function loadQuickInstallApps() {
  const container = document.getElementById('qi-apps-grid');
  if (!container) return;
  
  const grouped = {};
  curatedApps.forEach(app => {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  });

  let html = '';
  for (const [category, apps] of Object.entries(grouped)) {
    html += `<div style="grid-column: 1 / -1; margin-top:16px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
               <h3 style="font-size:15px; color:var(--primary); margin:0; text-transform:uppercase; letter-spacing:0.5px;" data-i18n="${category}">${window.appTranslations ? window.appTranslations[category] || category : category}</h3>
             </div>`;
    apps.forEach(app => {
      html += `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:10px 14px; display:flex; align-items:center; gap:12px; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
          <input type="checkbox" class="qi-checkbox" value="${app.id}" id="chk-${app.id}" style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer; flex-shrink:0;">
          <label for="chk-${app.id}" style="display:flex; align-items:center; gap:10px; cursor:pointer; width:100%;">
            <div>
              <div style="font-weight:600; font-size:14px; color:var(--text-main);">${app.name}</div>
            </div>
          </label>
        </div>
      `;
    });
  }
  container.innerHTML = html;
}

if (btnOpenQuickInstall && btnBackQuickInstall && subviewQuickInstall) {
  btnOpenQuickInstall.addEventListener('click', () => {
    openSub(subviewQuickInstall);
    loadQuickInstallApps();
  });
  btnBackQuickInstall.addEventListener('click', () => closeSub(subviewQuickInstall));
}

const btnQuickInstallStart = document.getElementById('btn-quick-install-start');
const qiProgressContainer = document.getElementById('qi-progress-container');
const qiProgressLog = document.getElementById('qi-progress-log');

const btnQiProgressClose = document.getElementById('btn-qi-progress-close');
if (btnQiProgressClose) {
  btnQiProgressClose.addEventListener('click', () => {
    if (qiProgressContainer) qiProgressContainer.style.display = 'none';
  });
}

if (btnQuickInstallStart) {
  btnQuickInstallStart.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.qi-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
      showToast(currentDictionary['msg_no_selection'] || 'Please select at least one item!', 'warning');
      return;
    }
    
    btnQuickInstallStart.disabled = true;
    qiProgressContainer.style.display = 'flex';
    qiProgressLog.innerHTML = `<div style="color:#08a4ff;">Starting installation for ${selectedIds.length} apps...</div>`;
    
    await window.electronAPI.quickInstall(selectedIds);
    
    btnQuickInstallStart.disabled = false;
    showToast(currentDictionary['msg_tweak_applied'] || 'Installation process completed!', 'success');
    
    // 5 saniye sonra popup'ı otomatik kapat
    setTimeout(() => {
      if (qiProgressContainer && qiProgressContainer.style.display !== 'none') {
        qiProgressContainer.style.display = 'none';
      }
    }, 5000);
  });
}

if (window.electronAPI && window.electronAPI.onQuickInstallProgress) {
  window.electronAPI.onQuickInstallProgress((data) => {
    const { status, appId, error, text: outText } = data;
    let color = '#fff';
    let text = '';
    
    const appName = curatedApps.find(a => a.id === appId)?.name || appId;
    
    if (!qiProgressLog) return;

    if (status === 'output') {
       let outDiv = document.getElementById('qi-out-' + appId.replace(/\./g, '-'));
       if (!outDiv) {
         outDiv = document.createElement('div');
         outDiv.id = 'qi-out-' + appId.replace(/\./g, '-');
         outDiv.style.color = '#888';
         outDiv.style.marginLeft = '12px';
         outDiv.style.fontSize = '12px';
         qiProgressLog.appendChild(outDiv);
       }
       // Process output
       let lines = outText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 1 && /[a-zA-Z0-9]/.test(l));
       if (lines.length > 0) {
         let lastLine = lines[lines.length - 1];
         outDiv.innerText = '> ' + lastLine.substring(0, 80) + (lastLine.length > 80 ? '...' : '');
         
         // Add UAC warning if it's installing
         if (lastLine.includes('Starting package install')) {
            let uacWarn = document.getElementById('uac-warn-' + appId.replace(/\./g, '-'));
            if (!uacWarn) {
               uacWarn = document.createElement('div');
               uacWarn.id = 'uac-warn-' + appId.replace(/\./g, '-');
               uacWarn.style.color = '#ffcc00';
               uacWarn.style.marginTop = '4px';
               uacWarn.style.fontSize = '12px';
               uacWarn.innerText = '<i class="fa-solid fa-triangle-exclamation"></i> Lütfen görev çubuğunda yanıp sönen bir Yönetici İzni (UAC) kalkanı olup olmadığını kontrol edin!';
               outDiv.appendChild(uacWarn);
            }
         }
       }
       qiProgressLog.scrollTop = qiProgressLog.scrollHeight;
       return;
    }

    if (status === 'installing') {
      color = '#ff9900';
      text = `[INSTALLING] Downloading and installing ${appName}...`;
    } else if (status === 'success') {
      color = '#00cc99';
      text = `[SUCCESS] ${appName} installed successfully!`;
      // remove output div
      let outDiv = document.getElementById('qi-out-' + appId.replace(/\./g, '-'));
      if (outDiv) outDiv.remove();
    } else if (status === 'error') {
      color = '#ff4757';
      text = `[ERROR] Failed to install ${appName}: ${error}`;
    }
    
    qiProgressLog.innerHTML += `<div style="color:${color}; margin-top:4px;">${text}</div>`;
    qiProgressLog.scrollTop = qiProgressLog.scrollHeight;
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





window.addEventListener('DOMContentLoaded', () => {
  ['shut-hrs', 'shut-mins', 'shut-smart-mb', 'shut-smart-dur', 'shut-smart-delay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (el.value === '') return;
        const val = parseFloat(el.value);
        if (el.hasAttribute('max')) {
          const max = parseFloat(el.getAttribute('max'));
          if (val > max) el.value = max;
        }
        if (el.hasAttribute('min')) {
          const min = parseFloat(el.getAttribute('min'));
          if (val < min) el.value = min;
        }
      });
    }
  });
});
