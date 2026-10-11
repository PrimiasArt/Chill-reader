export interface AppVersionInfo {
  versionName: string;
  versionCode: number;
  buildTime?: string;
  downloadUrl: string;
  releaseNotes?: string;
  assetSize?: number;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: {
    versionName: string;
    versionCode: number;
  };
  latestVersion?: AppVersionInfo;
  error?: string;
}

export interface UpdateDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
}

export type UpdateState = {
  isChecking: boolean;
  isDownloading: boolean;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  permissionRequired: boolean;
  updateAvailable: UpdateCheckResult | null;
  currentVersion: {
    versionName: string;
    versionCode: number;
  };
};

type UpdateListener = (state: UpdateState) => void;

const GITHUB_REPO = 'PrimiasArt/Chill-reader';
export const FALLBACK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/download/android-apk-latest/ChillReader-v1.0.apk`;

class AppUpdaterService {
  private listeners: Set<UpdateListener> = new Set();
  private state: UpdateState = {
    isChecking: false,
    isDownloading: false,
    progress: null,
    error: null,
    permissionRequired: false,
    updateAvailable: null,
    currentVersion: {
      versionName: '1.0',
      versionCode: 100
    }
  };

  constructor() {
    if (typeof window !== 'undefined') {
      (window as any).appUpdater = this;
      this.initCurrentVersion();
    }
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  public async initCurrentVersion(): Promise<{ versionName: string; versionCode: number }> {
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.getAppVersionInfo === 'function') {
        const raw = androidMedia.getAppVersionInfo();
        const parsed = JSON.parse(raw);
        if (parsed && parsed.versionCode) {
          this.state.currentVersion = {
            versionName: parsed.versionName || '1.0',
            versionCode: Number(parsed.versionCode)
          };
          this.notify();
          return this.state.currentVersion;
        }
      }
    } catch (e) {
      console.warn('Failed to get native version info:', e);
    }

    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.versionCode) {
          this.state.currentVersion = {
            versionName: data.versionName || '1.0',
            versionCode: Number(data.versionCode)
          };
          this.notify();
          return this.state.currentVersion;
        }
      }
    } catch {}

    return this.state.currentVersion;
  }

  public getState(): UpdateState {
    return this.state;
  }

  public getCurrentVersion() {
    return this.state.currentVersion;
  }

  public async checkForUpdates(_manual = false): Promise<UpdateCheckResult> {
    this.state.isChecking = true;
    this.state.error = null;
    this.notify();

    const current = await this.initCurrentVersion();

    let latest: AppVersionInfo | null = null;

    // 1. Try static version.json from GitHub Releases / Raw (fastest, no rate limits)
    try {
      const staticUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/version.json?t=${Date.now()}`;
      const res = await fetch(staticUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.versionCode) {
          latest = {
            versionName: data.versionName || '1.0',
            versionCode: Number(data.versionCode),
            buildTime: data.buildTime,
            downloadUrl: data.downloadUrl || FALLBACK_DOWNLOAD_URL,
            releaseNotes: data.releaseNotes || 'Bản cập nhật tính năng mới'
          };
        }
      }
    } catch (e) {
      console.warn('Failed to fetch static version.json:', e);
    }

    // 2. Fallback to GitHub Releases API
    if (!latest) {
      try {
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/android-apk-latest`;
        const res = await fetch(apiUrl, {
          headers: { Accept: 'application/vnd.github.v3+json' }
        });
        if (res.ok) {
          const release = await res.json();
          const apkAsset = release.assets?.find((a: any) => a.name.endsWith('.apk')) || release.assets?.[0];
          
          let parsedCode = 0;
          const matchCode = (release.body || '').match(/versionCode:?\s*(\d+)/i);
          if (matchCode) {
            parsedCode = parseInt(matchCode[1], 10);
          } else if (apkAsset && apkAsset.updated_at) {
            // Timestamp-based fallback code
            parsedCode = new Date(apkAsset.updated_at).getTime() / 1000;
          }

          latest = {
            versionName: release.name || release.tag_name || 'Mới nhất',
            versionCode: parsedCode,
            buildTime: apkAsset?.updated_at || release.published_at,
            downloadUrl: apkAsset?.browser_download_url || FALLBACK_DOWNLOAD_URL,
            releaseNotes: release.body || 'Bản cập nhật mới nhất từ GitHub',
            assetSize: apkAsset?.size
          };
        }
      } catch (e) {
        console.warn('Failed to fetch from GitHub API:', e);
      }
    }

    this.state.isChecking = false;

    if (!latest) {
      const err = 'Không thể kết nối đến máy chủ cập nhật. Vui lòng kiểm tra lại mạng.';
      this.state.error = err;
      this.notify();
      return {
        hasUpdate: false,
        currentVersion: current,
        error: err
      };
    }

    // Check if remote version is newer
    let hasUpdate = false;
    if (latest.versionCode > 0 && current.versionCode > 0) {
      hasUpdate = latest.versionCode > current.versionCode;
    } else if (latest.buildTime && current.versionCode) {
      hasUpdate = true;
    }

    // For manual check, if user clicks check and version is same, we show up-to-date
    const result: UpdateCheckResult = {
      hasUpdate,
      currentVersion: current,
      latestVersion: latest
    };

    this.state.updateAvailable = result;
    this.notify();
    return result;
  }

  public async startUpdate(downloadUrl?: string) {
    const targetUrl = downloadUrl || this.state.updateAvailable?.latestVersion?.downloadUrl || FALLBACK_DOWNLOAD_URL;
    
    this.state.isDownloading = true;
    this.state.error = null;
    this.state.permissionRequired = false;
    this.state.progress = { receivedBytes: 0, totalBytes: 100, percent: 0 };
    this.notify();

    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.downloadAndInstallApk === 'function') {
      try {
        androidMedia.downloadAndInstallApk(targetUrl);
      } catch (e: any) {
        this.onDownloadError(e.message || 'Lỗi khi gọi tải APK');
      }
    } else {
      // In web browser or desktop: open download in new tab
      window.open(targetUrl, '_blank');
      this.state.isDownloading = false;
      this.notify();
    }
  }

  public openInstallPermissionSettings() {
    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.openInstallPermissionSettings === 'function') {
      androidMedia.openInstallPermissionSettings();
    }
  }

  public dismissUpdate() {
    this.state.updateAvailable = null;
    this.state.error = null;
    this.notify();
  }

  // --- Callbacks invoked by AndroidMediaBridge in MainActivity.java ---

  public onDownloadProgress(receivedBytes: number, totalBytes: number, percent: number) {
    this.state.isDownloading = true;
    this.state.progress = {
      receivedBytes,
      totalBytes,
      percent: percent >= 0 ? percent : Math.min(99, Math.round((receivedBytes / (7 * 1024 * 1024)) * 100))
    };
    this.notify();
  }

  public onDownloadComplete() {
    this.state.isDownloading = false;
    this.state.progress = { receivedBytes: 100, totalBytes: 100, percent: 100 };
    this.notify();
  }

  public onDownloadError(errorMsg: string) {
    this.state.isDownloading = false;
    this.state.error = errorMsg || 'Tải bản cập nhật thất bại.';
    this.notify();
  }

  public onPermissionRequired() {
    this.state.permissionRequired = true;
    this.notify();
  }

  public onInstallError(errorMsg: string) {
    this.state.isDownloading = false;
    this.state.error = `Lỗi cài đặt: ${errorMsg}`;
    this.notify();
  }
}

export const appUpdater = new AppUpdaterService();
