const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = false;
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs/promises');
const crypto = require('crypto');
const os = require('os');

const { execSync, spawn } = require('child_process');

function checkAdmin() {
  try {
    execSync('fsutil dirty query %systemdrive%', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch (error) {
    return false;
  }
}

const isAdministrator = checkAdmin();

if (!isAdministrator) {
  let command = process.execPath;
  let args = app.isPackaged ? process.argv.slice(1) : [process.argv[1], ...process.argv.slice(2)];
  const argsStr = args.map(a => `"${a}"`).join(' ');
  
  const child = spawn('powershell.exe', [
    '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    `Start-Process -FilePath "${command}" -ArgumentList '${argsStr}' -Verb RunAs -WindowStyle Hidden`
  ], { detached: true, windowsHide: true });
  
  child.unref();
  app.quit();
}


const execPromise = util.promisify(exec);

let tray = null;
let mainWindow = null;
let minimizeToTray = false;

// SINGLE INSTANCE LOCK
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  process.exit(0); // Exit immediately without Electron cleanup delay to prevent resource hangs
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      // 750ms delay to ensure the OS has fully processed the second instance's exit and released resources
      setTimeout(() => {
        // VITAL: show() BEFORE restore() as per user feedback for better input channel restoration
        if (!mainWindow.isVisible()) mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();

        // HARD INTERACTION RESET: Ensure all input channels are active at the native level
        mainWindow.setEnabled(true);
        mainWindow.setIgnoreMouseEvents(false);
        mainWindow.setFocusable(true);

        // NATIVE PROPERTY TOGGLE: Forces Windows DWM to re-calculate hit-testing surfaces
        mainWindow.setResizable(false);
        mainWindow.setMovable(false);

        // RE-APPLY OVERLAY: Crucial for fixing titleBarOverlay hit-testing on Windows 11
        mainWindow.setTitleBarOverlay({
          color: '#1a1a1a',
          symbolColor: '#ffffff',
          height: 30
        });

        // Restore native properties
        mainWindow.setResizable(true);
        mainWindow.setMovable(true);

        // Blur-then-focus cycle and focus webContents directly
        mainWindow.blur();
        mainWindow.focus();
        mainWindow.webContents.focus();

        mainWindow.setAlwaysOnTop(true);
        mainWindow.setAlwaysOnTop(false);

        // Final fallback to ensure title bar buttons respond
        mainWindow.flashFrame(true);
        setTimeout(() => {
          if (mainWindow) mainWindow.flashFrame(false);
        }, 500);
      }, 750);
    }
  });
}

ipcMain.on('set-tray-setting', (event, val) => {
  minimizeToTray = val;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#ffffff',
      height: 30
    },
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'public', 'logo.png'),
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5133');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'out', 'index.html'));
  }

  mainWindow.on('minimize', (event) => {
    if (minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (!tray) {
    createTray();
  }
}

let trayLabelsGlobal = null;

function createTray(labels = null) {
  try {
    if (labels) trayLabelsGlobal = labels;

    const isDev = process.env.NODE_ENV === 'development';
    const trayIconPath = isDev
      ? path.join(__dirname, 'public', 'tray.png')
      : path.join(__dirname, 'out', 'tray.png');

    const icon = nativeImage.createFromPath(trayIconPath);

    if (!tray) {
      tray = new Tray(icon);
      tray.setToolTip('Ü Toolbox');
      tray.on('click', () => {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      });
    }

    const trayLabels = trayLabelsGlobal || {
      tray_show: 'Göster',
      tray_exit: 'Çıkış',
      tray_optimize_mem: 'Belleği Optimize Et'
    };

    const contextMenu = Menu.buildFromTemplate([
      { label: trayLabels.tray_show || 'Göster', click: () => { mainWindow.show(); mainWindow.focus(); } },
      {
        label: trayLabels.tray_optimize_mem || 'Belleği Optimize Et',
        click: async () => {
          // Background optimization
          const res = await performRamCleanup();

          if (res.success) {
            const title = trayLabels.ram_res_t || 'Operation Successful!';
            const body = (trayLabels.msg_clean_success || '{0} MB space successfully cleaned!').replace('{0}', res.freedMB);

            new Notification({
              title: title,
              body: body,
              icon: icon
            }).show();
          }
        }
      },
      { type: 'separator' },
      { label: trayLabels.tray_exit || 'Çıkış', click: () => { app.isQuitting = true; app.quit(); } }
    ]);

    tray.setContextMenu(contextMenu);
  } catch (e) { console.error('Tray init error:', e); }
}

ipcMain.on('update-tray-labels', (event, labels) => {
  if (tray) {
    createTray(labels);
  }
});

const si = require('systeminformation');

// System IPC Handlers
ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-system-info', async () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const ramUsageProc = Math.round((usedMemory / totalMemory) * 100) + '%';

  const uptimeSecs = os.uptime();
  const days = Math.floor(uptimeSecs / (3600 * 24));
  const hours = Math.floor((uptimeSecs % (3600 * 24)) / 3600);
  const minutes = Math.floor((uptimeSecs % 3600) / 60);

  const osData = await si.osInfo();
  const isWin11 = parseInt(os.release().split('.')[2], 10) >= 22000 && osData.distro.includes('10');
  const osVerName = isWin11 ? osData.distro.replace('10', '11') : osData.distro;
  const osVersion = `${osVerName} (${osData.build})`;

  return {
    osVersion,
    uptimeRaw: { days, hours, minutes },
    ramUsage: ramUsageProc,
    hardware: { ram: (totalMemory / (1024 * 1024 * 1024)).toFixed(0) + ' GB' }
  };
});

ipcMain.handle('get-hardware-info', async () => {
  const cpuData = await si.cpu();
  const cpuName = `${cpuData.manufacturer} ${cpuData.brand}`.replace(/  +/g, ' ');

  const baseboard = await si.baseboard();
  const mbName = `${baseboard.manufacturer} ${baseboard.model}`;

  const memLayout = await si.memLayout();
  const ramSlots = memLayout.length;
  const ramName = memLayout.length > 0 ? `${memLayout[0].manufacturer} ${memLayout[0].partNum}`.trim() : 'Bilinmeyen RAM';
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

  const graphics = await si.graphics();
  const gpuName = graphics.controllers.length > 0 ? graphics.controllers[0].model : 'Bilinmeyen GPU';
  let gpuVramGB = 0;
  if (graphics.controllers.length > 0 && graphics.controllers[0].vram) {
    // VRAM is usually in MB, convert to GB
    gpuVramGB = Math.round(graphics.controllers[0].vram / 1024);
  }

  const diskLayout = await si.diskLayout();
  const disks = diskLayout.map(d => ({
    name: d.name || d.vendor || 'Bilinmeyen Disk',
    type: d.type === 'HD' ? 'HDD' : (d.type || 'HDD/SSD'),
    sizeGB: Math.round(d.size / (1024 * 1024 * 1024))
  }));

  return {
    mb: mbName,
    cpu: cpuName,
    ram: ramName,
    ramSlots,
    totalRamGB,
    gpu: gpuName,
    gpuVramGB,
    disks
  };
});

ipcMain.handle('get-pc-usage-history', async () => {
  return new Promise((resolve) => {
    const psCommand = `
            $ErrorActionPreference = 'SilentlyContinue';
            $events = Get-WinEvent -FilterHashtable @{LogName='System'; Id=6005,6006,1,42} -MaxEvents 500;
            if ($null -ne $events) {
                $events | Select-Object Id, @{n='Time';e={$_.TimeCreated.ToString('o')}} | ConvertTo-Json -Compress
            } else {
                '[]'
            }
        `;
    const base64Script = Buffer.from(psCommand, 'utf16le').toString('base64');

    require('child_process').exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`, { windowsHide: true, maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
      if (error) {
        console.error("Event Log Error:", error);
        resolve([]);
      } else {
        try {
          const data = JSON.parse(stdout.trim());
          resolve(Array.isArray(data) ? data : (data ? [data] : []));
        } catch (e) {
          console.error("JSON Parse Error:", e);
          resolve([]);
        }
      }
    });
  });
});


ipcMain.handle('get-usage-stats', async () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const ramUsageProc = Math.round((usedMemory / totalMemory) * 100) + '%';

  const uptimeSecs = os.uptime();
  const days = Math.floor(uptimeSecs / (3600 * 24));
  const hours = Math.floor((uptimeSecs % (3600 * 24)) / 3600);
  const minutes = Math.floor((uptimeSecs % 3600) / 60);

  return {
    ramUsage: ramUsageProc,
    uptimeRaw: { days, hours, minutes },
    hardware: { ram: Math.round(totalMemory / (1024 * 1024 * 1024)) + ' GB' }
  };
});


async function getFolderStats(dirPath) {
  let stats = { size: 0, files: 0, folders: 0 };
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stats.folders++;
        const sub = await getFolderStats(fullPath);
        stats.size += sub.size;
        stats.files += sub.files;
        stats.folders += sub.folders;
      } else {
        stats.files++;
        try { stats.size += (await fs.stat(fullPath)).size; } catch(e) {}
      }
    }
  } catch(e) {}
  return stats;
}

async function getDirSize(dirPath) {
  const stats = await getFolderStats(dirPath);
  return stats.size;
}

ipcMain.handle('get-junk-sizes', async () => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    
    const dx_paths = [
      path.join(localAppData, 'D3DSCache'),
      path.join(localAppData, 'NVIDIA'),
      path.join(localAppData, 'NVIDIA Corporation'),
      path.join(localAppData, 'AMD'),
      path.join(localAppData, 'Intel'),
      path.join(localAppData, 'DirectX', 'GraphicsCache'),
      'C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\DirectX\\GraphicsCache',
      'C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\DirectX\\GraphicsCache'
    ];
    let dx_total = 0;
    for (let p of dx_paths) dx_total += await getDirSize(p);

    const sizes = {
      user_temp: await getDirSize(process.env.TEMP),
      win_temp: await getDirSize('C:\\Windows\\Temp'),
      win_update: await getDirSize('C:\\Windows\\SoftwareDistribution\\Download'),
      prefetch: await getDirSize('C:\\Windows\\Prefetch'),
      win_logs: await getDirSize('C:\\Windows\\Logs'),
      delivery_opt: await getDirSize('C:\\Windows\\SoftwareDistribution\\DeliveryOptimization'),
      minidumps: await getDirSize('C:\\Windows\\Minidump'),
      defender: await getDirSize('C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service'),
      wer: await getDirSize('C:\\ProgramData\\Microsoft\\Windows\\WER'),
      thumb_cache: await getDirSize(path.join(localAppData, 'Microsoft\\Windows\\Explorer')), // approximate
      inet_cache: await getDirSize(path.join(localAppData, 'Microsoft\\Windows\\INetCache')),
      recycle_bin: await getDirSize('C:\\$Recycle.Bin'),
      dx_cache: dx_total
    };
    return { success: true, sizes };
  } catch (error) {
    console.error('get-junk-sizes error:', error);
    return { success: false, sizes: { user_temp: 0, win_temp: 0, win_update: 0, prefetch: 0 } };
  }
});

ipcMain.handle('clean-junk', async (event, targets) => {
  try {
    let totalFreed = 0;
    const paths = [];
    if (targets.includes('user_temp')) paths.push(`$env:TEMP\\*`);
    if (targets.includes('win_temp')) paths.push(`'C:\\Windows\\Temp\\*'`);
    if (targets.includes('win_update')) paths.push(`'C:\\Windows\\SoftwareDistribution\\Download\\*'`);
    if (targets.includes('prefetch')) paths.push(`'C:\\Windows\\Prefetch\\*'`);
    if (targets.includes('win_logs')) paths.push(`'C:\\Windows\\Logs\\*'`);
    if (targets.includes('delivery_opt')) paths.push(`'C:\\Windows\\SoftwareDistribution\\DeliveryOptimization\\*'`);
    if (targets.includes('minidumps')) paths.push(`'C:\\Windows\\Minidump\\*'`);
    if (targets.includes('thumb_cache')) paths.push(`($env:LOCALAPPDATA + '\\Microsoft\\Windows\\Explorer\\thumbcache_*.db')`);
    if (targets.includes('defender')) paths.push(`'C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service\\*'`);
    if (targets.includes('wer')) paths.push(`'C:\\ProgramData\\Microsoft\\Windows\\WER\\*'`);
    if (targets.includes('inet_cache')) paths.push(`($env:LOCALAPPDATA + '\\Microsoft\\Windows\\INetCache\\*')`);
    if (targets.includes('dx_cache')) {
      paths.push(`($env:LOCALAPPDATA + '\\D3DSCache\\*')`);
      paths.push(`($env:LOCALAPPDATA + '\\NVIDIA\\*Cache*\\*')`);
      paths.push(`($env:LOCALAPPDATA + '\\NVIDIA Corporation\\*Cache*\\*')`);
      paths.push(`($env:LOCALAPPDATA + '\\AMD\\*Cache*\\*')`);
      paths.push(`($env:LOCALAPPDATA + '\\Intel\\*Cache*\\*')`);
      paths.push(`($env:LOCALAPPDATA + '\\DirectX\\GraphicsCache\\*')`);
      paths.push(`'C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\DirectX\\GraphicsCache\\*'`);
      paths.push(`'C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\DirectX\\GraphicsCache\\*'`);
    }
    if (targets.includes('recycle_bin')) paths.push(`'C:\\$Recycle.Bin\\*'`);

    if (paths.length === 0) return { success: true, message: 'Seçili konum yok.', freed: 0 };

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];

      event.sender.send('clean-progress', Math.round((i / paths.length) * 100));

      const cmd = `
           $sizeBefore = [long](Get-ChildItem -Path ${p} -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum;
           Remove-Item -Path ${p} -Recurse -Force -ErrorAction SilentlyContinue;
           $sizeAfter = [long](Get-ChildItem -Path ${p} -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum;
           Write-Output ($sizeBefore - $sizeAfter);
        `;

      const { stdout } = await execPromise(`powershell -NoProfile -Command "${cmd.replace(/\n/g, ' ')}"`);
      const freedBytes = parseInt(stdout.trim(), 10);
      if (!isNaN(freedBytes) && freedBytes > 0) totalFreed += freedBytes;

      event.sender.send('clean-progress', Math.round(((i + 1) / paths.length) * 100));
    }

    const freedMB = (totalFreed / (1024 * 1024)).toFixed(2);
    return { success: true, message: 'msg_clean_success', freed: freedMB };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

let koffiLoaded = false;
let OpenProcess, CloseHandle, EmptyWorkingSet, K32EnumProcesses, RtlAdjustPrivilege;

function initKoffi() {
    if (koffiLoaded) return;
    try {
        const koffi = require('koffi');
        const kernel32 = koffi.load('kernel32.dll');
        const psapi = koffi.load('psapi.dll');
        const ntdll = koffi.load('ntdll.dll');

        OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)');
        CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *hObject)');
        EmptyWorkingSet = psapi.func('int __stdcall EmptyWorkingSet(void *hProcess)');
        K32EnumProcesses = kernel32.func('bool __stdcall K32EnumProcesses(_Out_ uint32 *lpidProcess, uint32 cb, _Out_ uint32 *lpcbNeeded)');
        RtlAdjustPrivilege = ntdll.func('int __stdcall RtlAdjustPrivilege(uint32 Privilege, bool Enable, bool CurrentThread, _Out_ bool *Enabled)');

        koffiLoaded = true;
    } catch(e) {
        console.error('Koffi init error:', e);
    }
}

async function performRamCleanup() {
  const memBefore = os.totalmem() - os.freemem();
  
  initKoffi();
  if (koffiLoaded) {
      try {
          const prev = Buffer.alloc(1);
          RtlAdjustPrivilege(20, true, false, prev);
      } catch(e) {}

      const processIds = Buffer.alloc(1024 * 4);
      const bytesReturned = Buffer.alloc(4);
      if (K32EnumProcesses(processIds, processIds.length, bytesReturned)) {
          const numProcesses = bytesReturned.readUInt32LE(0) / 4;
          for (let i = 0; i < numProcesses; i++) {
              const pid = processIds.readUInt32LE(i * 4);
              const hProcess = OpenProcess(0x0100 | 0x0400, false, pid); // PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION
              if (hProcess && hProcess !== BigInt(0) && hProcess !== null) {
                  try {
                      EmptyWorkingSet(hProcess);
                      CloseHandle(hProcess);
                  } catch(e) {}
              }
          }
      }
  }

  // Allow OS to flush Standby pages before reading free memory
  await new Promise(r => setTimeout(r, 1000));

  const memAfter = os.totalmem() - os.freemem();
  const freedBytes = memBefore - memAfter;
  const freedMB = Math.max(0, (freedBytes / (1024 * 1024))).toFixed(0);

  return {
    success: true,
    beforeMB: (memBefore / (1024 * 1024)).toFixed(0),
    afterMB: (memAfter / (1024 * 1024)).toFixed(0),
    freedMB: freedMB
  };
}

ipcMain.handle('free-ram', async (event) => {
  try {
    event.sender.send('ram-progress', 20);
    await new Promise(r => setTimeout(r, 600));
    event.sender.send('ram-progress', 50);

    const result = await performRamCleanup();

    event.sender.send('ram-progress', 80);
    await new Promise(r => setTimeout(r, 600));
    event.sender.send('ram-progress', 100);

    return result;
  } catch (err) {
    return { success: false, message: err.message };
  }
});

async function shredSingleFile(filePath, onProgress) {
  const stat = await fs.stat(filePath);
  const passes = 3;
  // Use 4MB chunks for performance
  const CHUNK_SIZE = 4 * 1024 * 1024;
  const randomData = crypto.randomBytes(CHUNK_SIZE);
  
  for (let i = 0; i < passes; i++) {
    const handle = await fs.open(filePath, 'r+');
    let bytesWritten = 0;
    while (bytesWritten < stat.size) {
      const sizeToWrite = Math.min(CHUNK_SIZE, stat.size - bytesWritten);
      await handle.write(randomData, 0, sizeToWrite, bytesWritten);
      bytesWritten += sizeToWrite;
      if (onProgress && stat.size > CHUNK_SIZE) {
        const currentProgress = Math.round(((i / passes) + (bytesWritten / stat.size / passes)) * 100);
        onProgress(currentProgress);
      }
    }
    await handle.close();
    if (onProgress) onProgress(Math.round(((i + 1) / passes) * 100));
  }
  try {
    await fs.rename(filePath, filePath + '.shredded');
    await fs.unlink(filePath + '.shredded');
  } catch(e) {}
}

async function* getAllFilesAsync(dirPath) {
  const list = await fs.readdir(dirPath, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dirPath, dirent.name);
    if (dirent.isDirectory()) {
      yield* getAllFilesAsync(fullPath);
    } else {
      yield fullPath;
    }
  }
}

ipcMain.handle('show-shred-menu', async () => {
  return new Promise((resolve) => {
    const t = trayLabelsGlobal || {};
    const menu = Menu.buildFromTemplate([
      {
        label: t.sec_shred_btn_file || 'Dosya Seç',
        click: () => resolve('file')
      },
      {
        label: t.sec_shred_btn_folder || 'Klasör Seç',
        click: () => resolve('folder')
      },
      { type: 'separator' },
      {
        label: t.btn_back || 'İptal',
        role: 'cancel',
        click: () => resolve(null)
      }
    ]);
    menu.popup({ window: mainWindow });
  });
});

ipcMain.handle('shred-file', async (event, type) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: type === 'folder'
        ? ['openDirectory', 'dontAddToRecent']
        : ['openFile', 'multiSelections', 'dontAddToRecent'],
      title: "Güvenli Silinecek Veriyi Seçin",
      filters: type === 'folder' ? [] : [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, cancel: true };

    const targetPath = result.filePaths[0];
    const stats = await fs.stat(targetPath);

    if (stats.isDirectory()) {
      let fileCount = 0;
      // First pass to count total files (fast)
      async function countFiles(dir) {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (let d of list) {
            if (d.isDirectory()) await countFiles(path.join(dir, d.name));
            else fileCount++;
        }
      }
      await countFiles(targetPath);

      if (fileCount === 0) {
        await fs.rmdir(targetPath);
      } else {
        let i = 0;
        for await (const file of getAllFilesAsync(targetPath)) {
          await shredSingleFile(file);
          event.sender.send('shred-progress', {
            percent: Math.round(((i + 1) / fileCount) * 100),
            fileName: path.basename(file)
          });
          i++;
        }
        await fs.rm(targetPath, { recursive: true, force: true }).catch(() => { });
      }
    } else {
      await shredSingleFile(targetPath, (percent) => {
        event.sender.send('shred-progress', {
          percent,
          fileName: path.basename(targetPath)
        });
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Shred error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('schedule-shutdown', async (event, seconds) => {
  try {
    await execPromise(`shutdown /s /t ${seconds}`);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('cancel-shutdown', async (event) => {
  try {
    await execPromise('shutdown /a');
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || 'Kapatma iptal edilemedi.' };
  }
});

ipcMain.handle('create-restore-point', async () => {
  try {
    const scriptContent = `Enable-ComputerRestore -Drive 'C:\'; Checkpoint-Computer -Description 'Ü Toolbox Checkpoint' -RestorePointType 'MODIFY_SETTINGS'`;
    const base64Script = Buffer.from(scriptContent, 'utf16le').toString('base64');
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${base64Script}`;
    await execPromise(cmd);
    return { success: true, message: 'msg_restore_success' };
  } catch (err) {
    return { success: false, message: 'İşlem iptal edildi veya Sistem Koruması devre dışı bırakılmış.' };
  }
});

const TWEAKS_MAP = {
  'tweak-disable-nagle': {
    // Note: Nagle involves looping interfaces in Reg. We'll keep a fast PowerShell snippet for this specific array one.
    check: `IF (((Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\*" -Name "TcpAckFrequency" -ErrorAction SilentlyContinue).TcpAckFrequency -contains 1)) { '1' } ELSE { '0' }`,
    on: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -Type DWord }`,
    off: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -ErrorAction SilentlyContinue }`,
    reqAdmin: true, type: 'ps'
  },
  'tweak-disable-network-throttle': {
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', val: 'NetworkThrottlingIndex',
    checkType: 'DWORD', checkVal: '0xffffffff', // 4294967295
    onVal: '0xffffffff', offVal: '0xa', reqAdmin: true, type: 'reg'
  },
  'tweak-system-responsiveness': {
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', val: 'SystemResponsiveness',
    checkType: 'DWORD', checkVal: '0x0',
    onVal: '0x0', offVal: '0x14', reqAdmin: true, type: 'reg'
  },
  'tweak-disable-gamedvr': {
    check: `IF (((Get-ItemProperty "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -ErrorAction SilentlyContinue).GameDVR_Enabled -eq 0)) { '1' } ELSE { '0' }`,
    on: `Set-ItemProperty "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Type DWord -Value 0; If (!(Test-Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR")) { New-Item "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Force }; Set-ItemProperty "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -Type DWord -Value 0`,
    off: `Set-ItemProperty "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Type DWord -Value 1; Remove-ItemProperty "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -ErrorAction SilentlyContinue`,
    reqAdmin: true, type: 'ps'
  },
  'tweak-verbose-status': {
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', val: 'verbosestatus',
    checkType: 'DWORD', checkVal: '0x1',
    onVal: '0x1', offDelete: true, reqAdmin: true, type: 'reg'
  },
  'tweak-disable-lock-screen': {
    key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization', val: 'NoLockScreen',
    checkType: 'DWORD', checkVal: '0x1',
    onVal: '0x1', offDelete: true, reqAdmin: true, type: 'reg'
  },
  'tweak-ultimate-power': {
    check: `IF ((powercfg /getactivescheme) -match 'e9a42b02-d5df-448d-aa00-03f14749eb61') { '1' } ELSE { '0' }`,
    on: `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 & powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61`,
    off: `powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e`,
    reqAdmin: true, type: 'cmd'
  },
  'tweak-hibernate': {
    check: `IF ((Get-ItemProperty HKLM:\\System\\CurrentControlSet\\Control\\Power -ErrorAction SilentlyContinue).HibernateEnabled -eq 0) { '1' } ELSE { '0' }`,
    on: `powercfg.exe /hibernate off`,
    off: `powercfg.exe /hibernate on`,
    reqAdmin: true, type: 'cmd'
  },
  'tweak-telemetry': {
    key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', val: 'AllowTelemetry',
    checkType: 'DWORD', checkVal: '0x0',
    onVal: '0x0', offDelete: true, reqAdmin: true, type: 'reg'
  },
  'tweak-location': {
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', val: 'Value',
    checkType: 'SZ', checkVal: 'Deny',
    onVal: 'Deny', offVal: 'Allow', reqAdmin: true, type: 'reg'
  },
  'tweak-activity': {
    key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', val: 'PublishUserActivities',
    checkType: 'DWORD', checkVal: '0x0',
    onVal: '0x0', offDelete: true, reqAdmin: true, type: 'reg'
  },
  'tweak-disable-ndu': {
    key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Ndu', val: 'Start',
    checkType: 'DWORD', checkVal: '0x4',
    onVal: '0x4', offVal: '0x2', reqAdmin: true, type: 'reg'
  },
  'tweak-classic-context': {
    check: `IF (Test-Path "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32") { '1' } ELSE { '0' }`,
    on: `New-Item -Path "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32" -Force | Out-Null; Set-Item -Path "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32" -Value "" -Force; Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue`,
    off: `Remove-Item -Path "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" -Recurse -Force -ErrorAction SilentlyContinue; Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue`,
    reqAdmin: false, type: 'ps'
  },
  'tweak-remove-bing': {
    key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', val: 'DisableSearchBoxSuggestions',
    checkType: 'DWORD', checkVal: '0x1',
    onVal: '0x1', offDelete: true, reqAdmin: false, type: 'reg', restartExplorer: true
  },
  'tweak-show-hidden': {
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', val: 'Hidden',
    checkType: 'DWORD', checkVal: '0x1',
    onVal: '0x1', offVal: '0x2', reqAdmin: false, type: 'reg', restartExplorer: true,
    extraOn: 'reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced /v HideFileExt /t REG_DWORD /d 0 /f',
    extraOff: 'reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced /v HideFileExt /t REG_DWORD /d 1 /f'
  }
};

ipcMain.handle('get-all-tweak-statuses', async (event, tweakIds) => {
  try {
    const results = {};
    let script = '';
    for (const tId of tweakIds) {
      const tweak = TWEAKS_MAP[tId];
      if (!tweak) continue;
      if (tweak.type === 'reg') {
         script += `$r = & reg query "${tweak.key}" /v "${tweak.val}" 2>$null; if ($r -join ' ' -match "${tweak.checkVal}") { Write-Host "${tId}=1" } else { Write-Host "${tId}=0" };\n`;
      } else if (tweak.type === 'ps' || tweak.type === 'cmd') {
         script += `$r = Invoke-Command -ScriptBlock { ${tweak.check} }; Write-Host "${tId}=$r";\n`;
      }
    }
    
    if (script.length > 0) {
      const b64 = Buffer.from(script, 'utf16le').toString('base64');
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${b64}`;
      const { stdout } = await execPromise(cmd);
      
      const lines = stdout.split('\n');
      for (const line of lines) {
         const parts = line.trim().split('=');
         if (parts.length === 2) {
            results[parts[0]] = parts[1] === '1';
         }
      }
    }
    
    // Fallback for any tweak that failed or was missed
    for (const tId of tweakIds) {
      if (results[tId] === undefined) results[tId] = false;
    }
    return results;
  } catch (err) {
    console.error('get-all-tweak-statuses error:', err);
    return {};
  }
});

ipcMain.handle('apply-tweak', async (event, tweakId, enabled) => {
  try {
    const tweak = TWEAKS_MAP[tweakId];
    if (!tweak) return { success: false, message: 'Geçersiz Tweak ID.' };

    let commands = [];
    if (tweak.type === 'reg') {
       if (enabled) {
          commands.push(`reg add "${tweak.key}" /v "${tweak.val}" /t REG_${tweak.checkType} /d ${tweak.onVal} /f`);
          if (tweak.extraOn) commands.push(tweak.extraOn);
       } else {
          if (tweak.offDelete) {
             commands.push(`reg delete "${tweak.key}" /v "${tweak.val}" /f`);
          } else {
             commands.push(`reg add "${tweak.key}" /v "${tweak.val}" /t REG_${tweak.checkType} /d ${tweak.offVal} /f`);
          }
          if (tweak.extraOff) commands.push(tweak.extraOff);
       }
       // Removed auto-restart of explorer to prevent taskbar flashing.
       // The UI already warns the user that a restart may be required.
    } else {
       const scriptContent = enabled ? tweak.on : tweak.off;
       if (tweak.type === 'ps') {
          const b64 = Buffer.from(scriptContent, 'utf16le').toString('base64');
          commands.push(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${b64}`);
       } else {
          commands.push(scriptContent);
       }
    }

    // Since the app runs as Administrator, execute directly without .bat files or Start-Process
    for (const cmd of commands) {
       try { await execPromise(cmd, { windowsHide: true }); } catch(e){}
    }

    return { success: true, message: 'msg_tweak_applied' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('run-debloat-action', async (event, actionId) => {
  try {
    let scriptContent = '';
    if (actionId === 'btn-uninstall-edge') {
      scriptContent = `
                $edge = Get-AppxPackage -AllUsers *MicrosoftEdge*
                if ($edge) { Remove-AppxPackage -Package $edge.PackageFullName -AllUsers -ErrorAction SilentlyContinue }
                $setup = Get-ChildItem -Path "C:\\Program Files (x86)\\Microsoft\\Edge\\Application" -Filter "setup.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($setup) {
                    Start-Process -FilePath $setup.FullName -ArgumentList "--uninstall --system-level --force-uninstall" -Wait -NoNewWindow
                }
                # Fallback forced delete if setup doesn't work
                Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue
                if (Test-Path "C:\\Program Files (x86)\\Microsoft\\Edge") {
                    Remove-Item -Path "C:\\Program Files (x86)\\Microsoft\\Edge" -Recurse -Force -ErrorAction SilentlyContinue
                }
            `;
    } else if (actionId === 'btn-uninstall-onedrive') {
      scriptContent = `
                $onedriveSys = "$env:SystemRoot\\System32\\OneDriveSetup.exe"
                if (Test-Path $onedriveSys) { Start-Process $onedriveSys -ArgumentList "/uninstall" -Wait }
                $onedriveSys64 = "$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe"
                if (Test-Path $onedriveSys64) { Start-Process $onedriveSys64 -ArgumentList "/uninstall" -Wait }
            `;
    } else {
      return { success: false, message: 'Bilinmeyen işlem.' };
    }

    const base64Script = Buffer.from(scriptContent, 'utf16le').toString('base64');
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${base64Script}`;
    await execPromise(cmd);
    return { success: true, message: 'msg_tweak_applied' };
  } catch (err) {
    return { success: false, message: 'Kaldırma başarısız: ' + err.message };
  }
});

ipcMain.handle('check-debloat-status', async () => {
  try {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    
    // Check Edge (Appx check using PowerShell)
    let edgeExists = false;
    try {
      await fs.access(edgePath);
      edgeExists = true;
    } catch (e) {
      edgeExists = false;
    }

    // Check OneDrive (Actual executable, not the Setup file in System32)
    let driveExists = false;
    try {
      const { stdout } = await execPromise(`powershell -NoProfile -Command "Test-Path \\"$env:LOCALAPPDATA\\Microsoft\\OneDrive\\OneDrive.exe\\""`);
      driveExists = stdout.trim() === 'True';
      if(!driveExists) {
         const { stdout: odSysOut } = await execPromise(`powershell -NoProfile -Command "Test-Path \\"$env:ProgramFiles\\Microsoft OneDrive\\OneDrive.exe\\""`);
         driveExists = odSysOut.trim() === 'True';
      }
    } catch (e) {
      driveExists = false;
    }

    return { edgeInstalled: edgeExists, onedriveInstalled: driveExists };
  } catch (e) {
    return { edgeInstalled: true, onedriveInstalled: true };
  }
});

const LAYOUTS_FILE = path.join(app.getPath('userData'), 'desktop_layouts.json');

async function getSavedLayouts() {
  try {
    const data = await fs.readFile(LAYOUTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function saveLayouts(layouts) {
  await fs.writeFile(LAYOUTS_FILE, JSON.stringify(layouts, null, 2), 'utf8');
}

const DESKTOP_PS_SCRIPT = `
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;

#pragma warning disable 0649
#pragma warning disable 0169

public class DesktopManager {
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, IntPtr lpBuffer, int nSize, out IntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, IntPtr lpBuffer, int nSize, out IntPtr lpNumberOfBytesWritten);

    const uint LVM_GETITEMCOUNT = 0x1004;
    const uint LVM_GETITEMPOSITION = 0x1010;
    const uint LVM_GETITEMTEXTW = 0x1073;
    const uint LVM_SETITEMPOSITION32 = 0x1031;

    const uint PROCESS_VM_OPERATION = 0x0008;
    const uint PROCESS_VM_READ = 0x0010;
    const uint PROCESS_VM_WRITE = 0x0020;

    const uint MEM_COMMIT = 0x1000;
    const uint MEM_RESERVE = 0x2000;
    const uint MEM_RELEASE = 0x8000;
    const uint PAGE_READWRITE = 0x04;

    struct POINT {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct LVITEMW {
        public uint mask;
        public int iItem;
        public int iSubItem;
        public uint state;
        public uint stateMask;
        public IntPtr pszText;
        public int cchTextMax;
        public int iImage;
        public IntPtr lParam;
        public int iIndent;
        public int iGroupId;
        public uint cColumns;
        public IntPtr puColumns;
        public IntPtr piColFmt;
        public int iGroup;
    }

    static IntPtr GetDesktopListView() {
        IntPtr hProgman = FindWindow("Progman", null);
        IntPtr hDefView = FindWindowEx(hProgman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (hDefView == IntPtr.Zero) {
            IntPtr hWorkerW = IntPtr.Zero;
            do {
                hWorkerW = FindWindowEx(IntPtr.Zero, hWorkerW, "WorkerW", null);
                hDefView = FindWindowEx(hWorkerW, IntPtr.Zero, "SHELLDLL_DefView", null);
            } while (hDefView == IntPtr.Zero && hWorkerW != IntPtr.Zero);
        }
        if (hDefView != IntPtr.Zero) {
            return FindWindowEx(hDefView, IntPtr.Zero, "SysListView32", "FolderView");
        }
        return IntPtr.Zero;
    }

    public static string GetPositions() {
        IntPtr hListView = GetDesktopListView();
        if (hListView == IntPtr.Zero) return "ERROR: ListView not found";
        uint processId;
        GetWindowThreadProcessId(hListView, out processId);
        IntPtr hProcess = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, processId);
        if (hProcess == IntPtr.Zero) return "ERROR: OpenProcess failed";

        int count = (int)SendMessage(hListView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
        StringBuilder sb = new StringBuilder();
        uint itemSize = (uint)Marshal.SizeOf(typeof(LVITEMW));
        uint pointSize = (uint)Marshal.SizeOf(typeof(POINT));
        uint bufferSize = 1024;

        IntPtr pItem = VirtualAllocEx(hProcess, IntPtr.Zero, itemSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        IntPtr pPoint = VirtualAllocEx(hProcess, IntPtr.Zero, pointSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        IntPtr pBuffer = VirtualAllocEx(hProcess, IntPtr.Zero, bufferSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);

        for (int i = 0; i < count; i++) {
            LVITEMW item = new LVITEMW();
            item.cchTextMax = 512;
            item.pszText = pBuffer;
            IntPtr pLocalItem = Marshal.AllocHGlobal(Marshal.SizeOf(item));
            Marshal.StructureToPtr(item, pLocalItem, false);
            IntPtr bytesWritten;
            WriteProcessMemory(hProcess, pItem, pLocalItem, Marshal.SizeOf(item), out bytesWritten);
            Marshal.FreeHGlobal(pLocalItem);

            SendMessage(hListView, LVM_GETITEMTEXTW, (IntPtr)i, pItem);
            IntPtr pLocalBuffer = Marshal.AllocHGlobal(1024);
            IntPtr bytesRead;
            ReadProcessMemory(hProcess, pBuffer, pLocalBuffer, 1024, out bytesRead);
            string iconName = Marshal.PtrToStringUni(pLocalBuffer);
            Marshal.FreeHGlobal(pLocalBuffer);

            SendMessage(hListView, LVM_GETITEMPOSITION, (IntPtr)i, pPoint);
            IntPtr pLocalPoint = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(POINT)));
            ReadProcessMemory(hProcess, pPoint, pLocalPoint, Marshal.SizeOf(typeof(POINT)), out bytesRead);
            POINT point = (POINT)Marshal.PtrToStructure(pLocalPoint, typeof(POINT));
            Marshal.FreeHGlobal(pLocalPoint);

            if (!string.IsNullOrEmpty(iconName)) {
                sb.AppendLine(string.Format("{0}|{1}|{2}", iconName, point.x, point.y));
            }
        }

        VirtualFreeEx(hProcess, pItem, 0, MEM_RELEASE);
        VirtualFreeEx(hProcess, pPoint, 0, MEM_RELEASE);
        VirtualFreeEx(hProcess, pBuffer, 0, MEM_RELEASE);
        return sb.ToString();
    }

    public static string SetPositions(string payload) {
        var dict = new Dictionary<string, POINT>();
        var items = payload.Split(new string[] { "||" }, StringSplitOptions.RemoveEmptyEntries);
        foreach(var it in items) {
            var parts = it.Split('|');
            if (parts.Length == 3) {
                POINT pt = new POINT();
                pt.x = int.Parse(parts[1]);
                pt.y = int.Parse(parts[2]);
                dict[parts[0]] = pt;
            }
        }

        IntPtr hListView = GetDesktopListView();
        if (hListView == IntPtr.Zero) return "ERROR: ListView not found";
        uint processId;
        GetWindowThreadProcessId(hListView, out processId);
        IntPtr hProcess = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, processId);
        if (hProcess == IntPtr.Zero) return "ERROR: OpenProcess failed";

        int count = (int)SendMessage(hListView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
        uint itemSize = (uint)Marshal.SizeOf(typeof(LVITEMW));
        uint bufferSize = 1024;
        uint pointSize = (uint)Marshal.SizeOf(typeof(POINT));

        IntPtr pItem = VirtualAllocEx(hProcess, IntPtr.Zero, itemSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        IntPtr pBuffer = VirtualAllocEx(hProcess, IntPtr.Zero, bufferSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        IntPtr pPoint = VirtualAllocEx(hProcess, IntPtr.Zero, pointSize, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);

        for (int i = 0; i < count; i++) {
            LVITEMW item = new LVITEMW();
            item.cchTextMax = 512;
            item.pszText = pBuffer;
            IntPtr pLocalItem = Marshal.AllocHGlobal(Marshal.SizeOf(item));
            Marshal.StructureToPtr(item, pLocalItem, false);
            IntPtr bytesWritten;
            WriteProcessMemory(hProcess, pItem, pLocalItem, Marshal.SizeOf(item), out bytesWritten);
            Marshal.FreeHGlobal(pLocalItem);

            SendMessage(hListView, LVM_GETITEMTEXTW, (IntPtr)i, pItem);
            IntPtr pLocalBuffer = Marshal.AllocHGlobal(1024);
            IntPtr bytesRead;
            ReadProcessMemory(hProcess, pBuffer, pLocalBuffer, 1024, out bytesRead);
            string iconName = Marshal.PtrToStringUni(pLocalBuffer);
            Marshal.FreeHGlobal(pLocalBuffer);

            if (!string.IsNullOrEmpty(iconName) && dict.ContainsKey(iconName)) {
                POINT pt = dict[iconName];
                IntPtr pLocalPoint = Marshal.AllocHGlobal(Marshal.SizeOf(pt));
                Marshal.StructureToPtr(pt, pLocalPoint, false);
                WriteProcessMemory(hProcess, pPoint, pLocalPoint, Marshal.SizeOf(pt), out bytesWritten);
                Marshal.FreeHGlobal(pLocalPoint);
                SendMessage(hListView, LVM_SETITEMPOSITION32, (IntPtr)i, pPoint);
            }
        }

        VirtualFreeEx(hProcess, pItem, 0, MEM_RELEASE);
        VirtualFreeEx(hProcess, pBuffer, 0, MEM_RELEASE);
        VirtualFreeEx(hProcess, pPoint, 0, MEM_RELEASE);
        return "SUCCESS";
    }
}
`;

ipcMain.handle('get-desktop-layouts', async () => {
  return await getSavedLayouts();
});

ipcMain.handle('save-desktop-layout', async (event, name) => {
  try {
    const psCommand = `
      $code = @'
${DESKTOP_PS_SCRIPT}
'@
      Add-Type -TypeDefinition $code
      [DesktopManager]::GetPositions()
    `;
    const tmpScriptPath = path.join(os.tmpdir(), 'WinToolboxDesktopSave.ps1');
    await fs.writeFile(tmpScriptPath, psCommand, 'utf8');
    const { stdout, stderr } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScriptPath}"`);
    await fs.unlink(tmpScriptPath).catch(() => {});
    
    if (stdout.includes('ERROR:')) throw new Error(stdout);

    const positions = stdout.trim().split(/\r?\n/).filter(l => l.trim().length > 0).map(l => {
      const parts = l.trim().split('|');
      return { name: parts[0], x: parseInt(parts[1], 10), y: parseInt(parts[2], 10) };
    });

    if (positions.length === 0) throw new Error('No icons found. Stderr: ' + stderr + ' | Stdout: ' + stdout);

    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const resolutions = displays.map(d => `${d.size.width}x${d.size.height}`);

    const layouts = await getSavedLayouts();
    layouts[name] = {
      createdAt: new Date().toISOString(),
      icons: positions,
      monitorInfo: {
        count: displays.length,
        resolutions: resolutions
      }
    };
    await saveLayouts(layouts);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('restore-desktop-layout', async (event, name) => {
  try {
    const layouts = await getSavedLayouts();
    if (!layouts[name]) throw new Error('Layout not found');
    const layout = layouts[name];

    const payload = layout.icons.map(ic => `${ic.name}|${ic.x}|${ic.y}`).join('||');
    
    const psCommand = `
      $code = @'
${DESKTOP_PS_SCRIPT}
'@
      Add-Type -TypeDefinition $code
      [DesktopManager]::SetPositions('${payload.replace(/'/g, "''")}')
    `;
    
    const tmpScriptPath = path.join(os.tmpdir(), 'WinToolboxDesktopRestore.ps1');
    await fs.writeFile(tmpScriptPath, psCommand, 'utf8');
    const { stdout, stderr } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScriptPath}"`);
    await fs.unlink(tmpScriptPath).catch(() => {});
    
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('delete-desktop-layout', async (event, name) => {
  try {
    const layouts = await getSavedLayouts();
    delete layouts[name];
    await saveLayouts(layouts);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// --- Folder Compressor Logic ---
const fsPromises = require('fs').promises;
// removed duplicate spawn

ipcMain.handle('fc-select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('fc-analyze-folder', async (event, dirPath) => {
  return new Promise(async (resolve) => {
    let fileCount = 0;
    let totalSize = 0;
    
    // First, reliably get the actual file count and size using Node.js
    try {
      const stats = await getFolderStats(dirPath);
      fileCount = stats.files;
      totalSize = stats.size;
    } catch(e) {}

    // Then, use compact to find out the compressed size
    const proc = spawn('compact', ['/q', `/s:${dirPath}`], { cwd: dirPath, windowsHide: true });
    let output = '';
    
    proc.stdout.on('data', (data) => output += data.toString());
    
    proc.on('close', async () => {
      let compressedSize = totalSize; // Default to totalSize if parsing fails
      try {
        const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let ratioLineIdx = lines.findIndex(l => l.toLowerCase().includes('ratio') || l.toLowerCase().includes('oran'));
        if (ratioLineIdx > 0) {
          const sizeLine = lines[ratioLineIdx - 1];
          const matches = sizeLine.match(/[0-9.,]*[0-9][0-9.,]*/g);
          if (matches && matches.length >= 2) {
             const parseNum = (str) => parseInt(str.replace(/[.,]/g, ''), 10);
             const parsedTotal = parseNum(matches[0]);
             compressedSize = parseNum(matches[1]);
             // Optional: If totalSize from Node is 0 for some reason, use parsedTotal
             if (totalSize === 0) totalSize = parsedTotal;
          }
        }
      } catch (err) {}

      resolve({ size: totalSize, compressedSize: compressedSize, count: fileCount });
    });
  });
});

ipcMain.handle('fc-compress-folder', async (event, dirPath, mode, force) => {
  return new Promise((resolve) => {
    const args = ['/c', `/s:${dirPath}`, '/a', '/i', `/exe:${mode}`];
    if (force) args.push('/f');
    args.push('*');

    const proc = spawn('compact', args, { cwd: dirPath, windowsHide: true });
    let processedFiles = 0;

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('[OK]') || line.includes('[ERR]')) {
          processedFiles++;
          event.sender.send('fc-progress', { processedFiles });
        }
      }
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0 || processedFiles > 0 });
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });
  });
});

ipcMain.handle('fc-uncompress-folder', async (event, dirPath) => {
  return new Promise((resolve) => {
    const args = ['/u', `/s:${dirPath}`, '/a', '/i', '*'];
    const proc = spawn('compact', args, { cwd: dirPath, windowsHide: true });
    
    let processedFiles = 0;
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('[OK]') || line.includes('[ERR]')) {
          processedFiles++;
          event.sender.send('fc-progress', { processedFiles });
        }
      }
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0 || processedFiles > 0 });
    });
    proc.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });
  });
});

app.whenReady().then(() => {
  // Set AppUserModelId for Windows Notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.windows.u-toolbox');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto Updater Logic
autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'update-available', info });
});
autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'update-not-available', info });
});
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'download-progress', progress: progressObj });
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'update-downloaded', info });
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'error', error: err.message });
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});
