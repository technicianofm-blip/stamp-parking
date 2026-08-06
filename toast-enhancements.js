// ===================================================================
//  ENHANCED TOAST SYSTEM - UX IMPROVEMENTS
// ===================================================================

class EnhancedToastSystem {
  constructor() {
    this.toasts = [];
    this.maxVisible = 3;
    this.defaultDuration = 3000;
    this.isShowingNotification = false;
    this.initContainer();
  }

  initContainer() {
    // ✅ ตรวจว่า container แบบ enhanced สร้างไว้แล้วจริง (ไม่ใช่แค่มี #toasts ของระบบเก่า)
    //    — index.html ยังมี <div id="toasts"> ไว้เป็น fallback ถ้า script นี้ไม่โหลด
    //    ถ้าเช็คด้วย getElementById('toasts') ระบบ enhanced จะไม่สร้าง container เลย → toast ไม่แสดง
    let area = document.querySelector('.enhanced-toast-area');
    if (area) return;

    const container = document.createElement('div');
    container.id = 'enhanced-toasts';
    container.className = 'enhanced-toasts-container';
    container.innerHTML = `
      <div class="enhanced-toast-container">
        <div class="enhanced-toast-queue" aria-live="polite" aria-atomic="true">
          <div class="enhanced-toast-area"></div>
          <div class="enhanced-notification-area"></div>
          <div class="enhanced-warning-area"></div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }

  show(type = 'info', message, options = {}) {
    const id = 'enhanced-toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const config = {
      duration: options.duration !== undefined ? options.duration : this.defaultDuration,
      title: options.title || this.getTitle(type),
      icon: options.icon || this.getIcon(type),
      className: options.className || '',
      actions: options.actions || [],
      progress: options.progress !== false,
      dismissible: options.dismissible !== false,
      showTime: options.showTime || false
    };

    const toast = {
      id,
      type,
      message,
      config,
      timestamp: new Date(),
      element: null,
      progressInterval: null
    };

    this.toasts.push(toast);
    this.renderToast(toast);
    this.updateQueue();

    // Auto remove after duration
    if (config.duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, config.duration);
    }

    return id;
  }

  renderToast(toast) {
    const area = document.querySelector('.enhanced-toast-area');
    if (!area) return;

    const toastElement = document.createElement('div');
    toastElement.className = `enhanced-toast ${toast.type} ${toast.config.className}`;
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'polite');
    toastElement.setAttribute('aria-atomic', 'true');
    toastElement.id = toast.id;

    const icon = toast.config.icon || this.getIcon(toast.type);
    const title = toast.config.title;

    toastElement.innerHTML = `
      <div class="enhanced-toast-content">
        <div class="enhanced-toast-header">
          <span class="enhanced-toast-icon">${icon}</span>
          <span class="enhanced-toast-title">${title}</span>
          ${toast.config.dismissible ? '<button class="enhanced-toast-close" onclick="enhancedToast.removeToast(\'${toast.id}\')">×</button>' : ''}
          ${toast.config.showTime ? `<span class="enhanced-toast-time">${this.formatTime(toast.timestamp)}</span>` : ''}
        </div>
        <div class="enhanced-toast-body">
          <div class="enhanced-toast-message">${toast.message}</div>
          ${toast.config.actions.length > 0 ? `
            <div class="enhanced-toast-actions">
              ${toast.config.actions.map(action => `
                <button class="enhanced-toast-action-btn" onclick="${action.onClick}">${action.text}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${toast.config.progress ? `
          <div class="enhanced-toast-progress-container">
            <div class="enhanced-toast-progress-bar" style="animation-duration: ${toast.config.duration}ms"></div>
          </div>
        ` : ''}
      </div>
    `;

    area.appendChild(toastElement);
    toast.element = toastElement;

    // Add animation class
    setTimeout(() => {
      toastElement.classList.add('enhanced-toast-show');
    }, 10);

    // Setup progress animation
    if (toast.config.progress) {
      toast.progressInterval = setInterval(() => {
        const progressBar = toastElement.querySelector('.enhanced-toast-progress-bar');
        if (progressBar) {
          const width = parseFloat(getComputedStyle(progressBar).width);
          if (width > 0) {
            progressBar.style.width = width - (100 / (toast.config.duration / 100)) + '%';
          }
        }
      }, 100);
    }
  }

  removeToast(id) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast) return;

    // Clear progress interval
    if (toast.progressInterval) {
      clearInterval(toast.progressInterval);
    }

    // Remove element with animation
    if (toast.element) {
      toast.element.classList.add('enhanced-toast-hide');
      setTimeout(() => {
        if (toast.element && toast.element.parentNode) {
          toast.element.parentNode.removeChild(toast.element);
        }
      }, 300);
    }

    // Remove from array
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.updateQueue();
  }

  updateQueue() {
    // Keep only the most recent toasts
    const visibleToasts = this.toasts.filter(toast =>
      toast.element && toast.element.parentNode
    );

    if (visibleToasts.length > this.maxVisible) {
      const toRemove = visibleToasts.slice(0, visibleToasts.length - this.maxVisible);
      toRemove.forEach(toast => {
        this.removeToast(toast.id);
      });
    }
  }

  showSuccess(message, options = {}) {
    return this.show('success', message, { ...options, duration: options.duration || 3000 });
  }

  showError(message, options = {}) {
    return this.show('error', message, { ...options, duration: options.duration || 4000 });
  }

  showWarning(message, options = {}) {
    return this.show('warning', message, { ...options, duration: options.duration || 4000 });
  }

  showInfo(message, options = {}) {
    return this.show('info', message, { ...options, duration: options.duration || 3000 });
  }

  showLoading(message, options = {}) {
    return this.show('loading', message, {
      ...options,
      duration: 0, // 0 duration for loading (manual close)
      progress: false,
      showTime: false
    });
  }

  showNotification(message, options = {}) {
    return this.show('notification', message, {
      ...options,
      duration: 5000,
      className: 'enhanced-notification'
    });
  }

  getTitle(type) {
    const titles = {
      'success': '✅ สำเร็จ',
      'error': '❌ ผิดพลาด',
      'warning': '⚠️ คำเตือน',
      'info': 'ℹ️ ข้อมูล',
      'loading': '🔄 กำลังดำเนินการ',
      'notification': '🔔 แจ้งเตือน'
    };
    return titles[type] || 'การแจ้งเตือน';
  }

  getIcon(type) {
    const icons = {
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'info': 'ℹ️',
      'loading': '🔄',
      'notification': '🔔'
    };
    return icons[type] || '📋';
  }

  formatTime(date) {
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  clearAll() {
    this.toasts.forEach(toast => {
      if (toast.progressInterval) {
        clearInterval(toast.progressInterval);
      }
      if (toast.element && toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
    });
    this.toasts = [];
  }
}

// Initialize enhanced toast system
const enhancedToast = new EnhancedToastSystem();

// Replace original toast functions for backward compatibility
window.toast = function(msg, type = 's') {
  const typeMap = {
    's': 'success',
    'e': 'error',
    'w': 'warning',
    'i': 'info'
  };
  return enhancedToast.show(typeMap[type] || 'info', msg);
};

window.showToast = window.toast;
window.showSuccess = enhancedToast.showSuccess.bind(enhancedToast);
window.showError = enhancedToast.showError.bind(enhancedToast);
window.showWarning = enhancedToast.showWarning.bind(enhancedToast);
window.showInfo = enhancedToast.showInfo.bind(enhancedToast);
window.showLoading = enhancedToast.showLoading.bind(enhancedToast);
window.showNotification = enhancedToast.showNotification.bind(enhancedToast);
window.clearToasts = enhancedToast.clearAll.bind(enhancedToast);