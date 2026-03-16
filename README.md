<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#0a0a0f">
    <meta name="background-color" content="#0a0a0f">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="MCP Dash">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="description" content="MCP Dashboard - Personal control center for tasks, tools, and AI workflows">
    <meta name="format-detection" content="telephone=no">
    
    <title>MCP Dashboard</title>
    
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="icons/icon-192x192.png">
    <link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32x32.png">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            user-select: none;
        }

        :root {
            --bg-primary: #0a0a0f;
            --bg-secondary: #12121a;
            --bg-card: #1a1a25;
            --bg-hover: #252535;
            --accent-primary: #6366f1;
            --accent-secondary: #8b5cf6;
            --accent-success: #10b981;
            --accent-warning: #f59e0b;
            --accent-danger: #ef4444;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --border: #2d2d3a;
            --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
            --safe-top: env(safe-area-inset-top);
            --safe-bottom: env(safe-area-inset-bottom);
        }

        html {
            height: 100%;
            overflow: hidden;
            position: fixed;
            width: 100%;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            height: 100%;
            overflow: hidden;
            position: fixed;
            width: 100%;
            overscroll-behavior-y: none;
            -webkit-overflow-scrolling: touch;
        }

        #app {
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Selection Mode */
        .selection-mode .task-item {
            padding-left: 2.5rem;
        }

        .task-checkbox {
            position: absolute;
            left: 0.875rem;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border);
            border-radius: 6px;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            transition: all 0.2s;
        }

        .selection-mode .task-checkbox {
            display: flex;
        }

        .task-item.selected .task-checkbox {
            background: var(--accent-primary);
            border-color: var(--accent-primary);
        }

        .task-item.selected {
            border-color: var(--accent-primary);
            background: rgba(99, 102, 241, 0.1);
        }

        /* Header Actions */
        .header-actions {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        .selection-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: var(--accent-primary);
            padding: calc(0.75rem + var(--safe-top)) 1rem 0.75rem;
            z-index: 101;
            transform: translateY(-100%);
            transition: transform 0.3s;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .selection-bar.active {
            transform: translateY(0);
        }

        /* Logs Filter */
        .logs-filter {
            display: flex;
            gap: 0.5rem;
            padding: 0 1rem 0.75rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }

        .filter-btn {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 0.375rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }

        .filter-btn.active {
            background: var(--accent-primary);
            color: white;
            border-color: var(--accent-primary);
        }

        /* XP Popup */
        .xp-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            background: var(--bg-card);
            border: 2px solid var(--accent-primary);
            border-radius: 20px;
            padding: 2rem;
            text-align: center;
            z-index: 400;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: 0 0 40px rgba(99, 102, 241, 0.4);
        }

        .xp-popup.show {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }

        .xp-popup-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }

        .xp-popup-amount {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        /* Velocity-based swipe */
        .task-item.swiping {
            transition: none;
        }

        /* Rest of previous styles... */
        .install-prompt {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--bg-card);
            border-top: 1px solid var(--border);
            padding: 1rem;
            padding-bottom: calc(1rem + var(--safe-bottom));
            z-index: 1000;
            transform: translateY(100%);
            transition: transform 0.3s ease;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
        }

        .install-prompt.show {
            transform: translateY(0);
        }

        .install-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .install-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .install-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
        }

        .install-text {
            flex: 1;
        }

        .install-title {
            font-weight: 600;
            margin-bottom: 0.25rem;
        }

        .install-subtitle {
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .install-buttons {
            display: flex;
            gap: 0.5rem;
        }

        .btn-install {
            background: var(--accent-primary);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 10px;
            font-weight: 600;
            cursor: pointer;
        }

        .btn-dismiss {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border);
            padding: 0.75rem 1rem;
            border-radius: 10px;
            cursor: pointer;
        }

        .offline-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: var(--accent-warning);
            color: #000;
            text-align: center;
            padding: 0.5rem;
            font-size: 0.85rem;
            font-weight: 600;
            z-index: 1001;
            transform: translateY(-100%);
            transition: transform 0.3s;
        }

        .offline-bar.show {
            transform: translateY(0);
        }

        .sync-status {
            position: fixed;
            top: calc(50px + var(--safe-top));
            right: 1rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 0.5rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            z-index: 50;
            transform: translateY(-100px);
            transition: transform 0.3s;
        }

        .sync-status.show {
            transform: translateY(0);
        }

        .sync-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--border);
            border-top-color: var(--accent-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .header {
            background: rgba(18, 18, 26, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1rem;
            padding-top: calc(0.75rem + var(--safe-top));
            position: sticky;
            top: 0;
            z-index: 100;
            flex-shrink: 0;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1400px;
            margin: 0 auto;
        }

        .logo {
            font-size: 1.25rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .logo::before {
            content: "◆";
            font-size: 1rem;
            -webkit-text-fill-color: var(--accent-primary);
        }

        .header-stats {
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        .stat-item {
            text-align: center;
        }

        .stat-value {
            font-size: 1rem;
            font-weight: 700;
            color: var(--accent-primary);
        }

        .stat-label {
            font-size: 0.65rem;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        .user-badge {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.85rem;
            position: relative;
        }

        .user-badge::after {
            content: "3";
            position: absolute;
            top: -2px;
            right: -2px;
            background: var(--accent-danger);
            color: white;
            font-size: 0.65rem;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid var(--bg-secondary);
        }

        .main-scroll {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            padding-bottom: calc(80px + var(--safe-bottom));
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem;
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        @media (min-width: 1024px) {
            .container {
                grid-template-columns: 1fr 350px;
                padding: 1.5rem;
            }
        }

        .card {
            background: var(--bg-card);
            border-radius: 16px;
            border: 1px solid var(--border);
            overflow: hidden;
            margin-bottom: 1rem;
            box-shadow: var(--shadow);
        }

        .card-header {
            padding: 1rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .card-title {
            font-size: 1rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .card-title-icon {
            width: 28px;
            height: 28px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
        }

        .card-body {
            padding: 1rem;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
            margin-bottom: 1rem;
        }

        .metric-card {
            background: var(--bg-card);
            border-radius: 12px;
            padding: 0.875rem;
            text-align: center;
            border: 1px solid var(--border);
        }

        .metric-value {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--accent-primary);
            margin-bottom: 0.25rem;
        }

        .metric-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        .task-list {
            display: flex;
            flex-direction: column;
            gap: 0.625rem;
        }

        .task-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 0.875rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            transition: all 0.2s;
            position: relative;
            overflow: hidden;
            touch-action: pan-y;
        }

        .task-item:active {
            transform: scale(0.98);
            background: var(--bg-hover);
        }

        .task-item.running {
            border-color: var(--accent-primary);
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
        }

        .task-status {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .task-status.idle { background: var(--text-secondary); }
        .task-status.ready { background: var(--accent-success); }
        .task-status.running { 
            background: var(--accent-primary); 
            animation: pulse 1.5s infinite;
        }
        .task-status.error { background: var(--accent-danger); }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }

        .task-info {
            flex: 1;
            min-width: 0;
        }

        .task-name {
            font-weight: 600;
            font-size: 0.95rem;
            margin-bottom: 0.25rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .task-meta {
            display: flex;
            gap: 0.5rem;
            font-size: 0.75rem;
            color: var(--text-secondary);
            flex-wrap: wrap;
            align-items: center;
        }

        .task-tag {
            background: rgba(99, 102, 241, 0.1);
            color: var(--accent-primary);
            padding: 0.15rem 0.4rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 500;
        }

        .task-actions {
            display: flex;
            gap: 0.375rem;
        }

        .btn-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            font-size: 1rem;
        }

        .btn-icon:active {
            transform: scale(0.9);
            background: var(--accent-primary);
            color: white;
            border-color: var(--accent-primary);
        }

        .drop-zone {
            border: 2px dashed var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            text-align: center;
            transition: all 0.3s;
            background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 10px,
                rgba(99, 102, 241, 0.02) 10px,
                rgba(99, 102, 241, 0.02) 20px
            );
        }

        .drop-zone.drag-over {
            border-color: var(--accent-primary);
            background: rgba(99, 102, 241, 0.1);
            transform: scale(1.02);
        }

        .drop-zone-icon {
            font-size: 2.5rem;
            margin-bottom: 0.75rem;
            opacity: 0.5;
        }

        .drop-zone-text {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 0.25rem;
        }

        .drop-zone-hint {
            font-size: 0.75rem;
            color: var(--text-secondary);
            opacity: 0.6;
        }

        .tools-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.5rem;
        }

        .tool-btn {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 0.75rem 0.5rem;
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.375rem;
            font-size: 0.75rem;
        }

        .tool-btn:active {
            background: var(--accent-primary);
            border-color: var(--accent-primary);
            transform: scale(0.95);
        }

        .tool-btn .icon {
            font-size: 1.25rem;
        }

        .xp-container {
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 0.875rem;
            margin-bottom: 0.875rem;
        }

        .xp-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            font-size: 0.85rem;
        }

        .xp-bar {
            height: 6px;
            background: var(--bg-hover);
            border-radius: 3px;
            overflow: hidden;
        }

        .xp-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 3px;
            transition: width 0.5s ease;
            position: relative;
        }

        .xp-fill::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .badges-container {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .badge {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            background: var(--bg-secondary);
            border: 2px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            transition: all 0.2s;
            position: relative;
        }

        .badge.unlocked {
            border-color: var(--accent-warning);
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.3);
        }

        .badge.locked {
            opacity: 0.3;
            filter: grayscale(1);
        }

        .heatmap {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 3px;
            margin-top: 0.75rem;
        }

        .heatmap-cell {
            aspect-ratio: 1;
            border-radius: 3px;
            background: var(--bg-secondary);
            transition: all 0.3s;
        }

        .heatmap-cell.active {
            background: var(--accent-primary);
            box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
        }

        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(18, 18, 26, 0.95);
            backdrop-filter: blur(20px);
            border-top: 1px solid var(--border);
            padding: 0.5rem 1rem calc(0.5rem + var(--safe-bottom));
            z-index: 99;
            display: flex;
            justify-content: space-around;
            align-items: center;
        }

        .nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.25rem;
            padding: 0.5rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.65rem;
            transition: all 0.2s;
        }

        .nav-item.active {
            color: var(--accent-primary);
        }

        .nav-icon {
            font-size: 1.25rem;
        }

        .fab {
            position: fixed;
            bottom: calc(80px + var(--safe-bottom));
            right: 1rem;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
            transition: all 0.3s;
            z-index: 98;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .fab:active {
            transform: scale(0.9);
        }

        .fab.rotate {
            transform: rotate(45deg);
        }

        .ptr-indicator {
            position: absolute;
            top: -60px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 40px;
            background: var(--bg-card);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--border);
            opacity: 0;
            transition: opacity 0.2s;
        }

        .ptr-indicator.visible {
            opacity: 1;
        }

        .ptr-indicator.spinning {
            animation: spin 1s linear infinite;
        }

        .logs-sheet {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            border-radius: 20px 20px 0 0;
            max-height: 80%;
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 200;
            display: flex;
            flex-direction: column;
        }

        .logs-sheet.open {
            transform: translateY(0);
        }

        .logs-handle {
            width: 40px;
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            margin: 0.75rem auto;
        }

        .logs-header {
            padding: 0 1rem 0.75rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
        }

        .logs-content {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 0.8rem;
        }

        .log-entry {
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--border);
            display: flex;
            gap: 0.75rem;
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
        }

        .log-time {
            color: var(--text-secondary);
            flex-shrink: 0;
            font-size: 0.75rem;
        }

        .log-type {
            padding: 0.1rem 0.3rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            flex-shrink: 0;
        }

        .log-type.info { background: rgba(99, 102, 241, 0.2); color: var(--accent-primary); }
        .log-type.success { background: rgba(16, 185, 129, 0.2); color: var(--accent-success); }
        .log-type.error { background: rgba(239, 68, 68, 0.2); color: var(--accent-danger); }

        .log-message {
            color: var(--text-primary);
            word-break: break-word;
        }

        .toast-container {
            position: fixed;
            top: calc(60px + var(--safe-top));
            left: 1rem;
            right: 1rem;
            z-index: 300;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            pointer-events: none;
        }

        .toast {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 0.875rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            animation: toastIn 0.3s ease;
            pointer-events: auto;
        }

        @keyframes toastIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .toast-icon {
            font-size: 1.25rem;
        }

        .toast-content {
            flex: 1;
        }

        .toast-title {
            font-weight: 600;
            font-size: 0.9rem;
            margin-bottom: 0.125rem;
        }

        .toast-message {
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: none;
            align-items: flex-end;
            justify-content: center;
            z-index: 300;
            backdrop-filter: blur(5px);
        }

        .modal-overlay.active {
            display: flex;
        }

        .modal {
            background: var(--bg-card);
            border-radius: 20px 20px 0 0;
            width: 100%;
            max-height: 90%;
            overflow: hidden;
            animation: modalUp 0.3s ease;
        }

        @keyframes modalUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
        }

        .modal-header {
            padding: 1.25rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-body {
            padding: 1.25rem;
            overflow-y: auto;
            max-height: 60vh;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .form-label {
            display: block;
            margin-bottom: 0.375rem;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .form-input, .form-select {
            width: 100%;
            padding: 0.875rem 1rem;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text-primary);
            font-size: 1rem;
            transition: border-color 0.2s;
            -webkit-appearance: none;
        }

        .form-input:focus, .form-select:focus {
            outline: none;
            border-color: var(--accent-primary);
        }

        .btn-primary {
            width: 100%;
            padding: 1rem;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border: none;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
        }

        .btn-primary:active {
            opacity: 0.9;
            transform: scale(0.98);
        }

        .landscape-warning {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-primary);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 1rem;
            text-align: center;
            padding: 2rem;
        }

        @media (max-height: 500px) and (orientation: landscape) {
            .landscape-warning {
                display: flex;
            }
        }

        .main-scroll::-webkit-scrollbar {
            display: none;
        }
        
        .main-scroll {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }

        @media (hover: none) {
            .btn-icon:hover, .tool-btn:hover, .task-item:hover {
                background: transparent;
            }
            
            .btn-icon:active, .tool-btn:active, .task-item:active {
                background: var(--accent-primary);
            }
        }

        @media (min-width: 768px) {
            .container {
                padding: 1.5rem;
            }
            
            .bottom-nav {
                display: none;
            }
            
            .fab {
                bottom: 2rem;
                right: 2rem;
            }
            
            .main-scroll {
                padding-bottom: 2rem;
            }
        }
    </style>
</head>
<body>
    <!-- Landscape Warning -->
    <div class="landscape-warning">
        <div style="font-size: 3rem;">📱</div>
        <h2>Please rotate your device</h2>
        <p>This app works best in portrait mode</p>
    </div>

    <!-- Offline Indicator -->
    <div class="offline-bar" id="offlineBar">
        ⚠️ You're offline - Changes will sync when reconnected
    </div>

    <!-- Selection Bar -->
    <div class="selection-bar" id="selectionBar">
        <div style="font-weight: 600;">
            <span id="selectionCount">0</span> selected
        </div>
        <div style="display: flex; gap: 0.5rem;">
            <button class="btn-icon" onclick="duplicateSelected()" title="Duplicate">📋</button>
            <button class="btn-icon danger" onclick="deleteSelected()" title="Delete">🗑</button>
            <button class="btn-icon" onclick="clearSelection()" title="Cancel">✕</button>
        </div>
    </div>

    <!-- XP Popup -->
    <div class="xp-popup" id="xpPopup">
        <div class="xp-popup-icon">✨</div>
        <div class="xp-popup-amount">+<span id="xpAmount">0</span> XP</div>
        <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">Keep it up!</div>
    </div>

    <!-- Sync Status -->
    <div class="sync-status" id="syncStatus">
        <div class="sync-spinner"></div>
        <span>Syncing...</span>
    </div>

    <!-- App Container -->
    <div id="app">
        <!-- Header -->
        <header class="header" id="mainHeader">
            <div class="header-content">
                <div class="logo">MCP</div>
                <div class="header-stats">
                    <div class="stat-item">
                        <div class="stat-value" id="activeTasks">0</div>
                        <div class="stat-label">Active</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="totalXP">0</div>
                        <div class="stat-label">XP</div>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="btn-icon" onclick="toggleSelectionMode()" id="selectBtn" title="Select">☐</button>
                    <div class="user-badge">ME</div>
                </div>
            </div>
        </header>

        <!-- Main Scroll Area -->
        <div class="main-scroll" id="mainScroll">
            <div class="ptr-indicator" id="ptrIndicator">🔄</div>
            
            <div class="container">
                <div class="main-content">
                    <!-- Metrics -->
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-value" id="runsToday">0</div>
                            <div class="metric-label">Runs Today</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="streakDays">0</div>
                            <div class="metric-label">Day Streak</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="tasksCompleted">0</div>
                            <div class="metric-label">Completed</div>
                        </div>
                    </div>

                    <!-- Task Area -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">
                                <div class="card-title-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--accent-success);">📋</div>
                                Tasks
                            </div>
                            <button class="btn-icon" onclick="refreshTasks()" title="Refresh">🔄</button>
                        </div>
                        <div class="card-body">
                            <div class="task-list" id="taskList">
                                <!-- Tasks injected here -->
                            </div>
                        </div>
                    </div>

                    <!-- Drop Zone -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">
                                <div class="card-title-icon" style="background: rgba(99, 102, 241, 0.1); color: var(--accent-primary);">📥</div>
                                Drop Zone
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="drop-zone" id="dropZone">
                                <div class="drop-zone-icon">📦</div>
                                <div class="drop-zone-text">Tap to upload or drop files</div>
                                <div class="drop-zone-hint">Supports .py, .js, .json, .md</div>
                            </div>
                            <input type="file" id="fileInput" style="display: none;" accept=".py,.js,.json,.md,.txt,.yaml,.yml,.toml">
                        </div>
                    </div>

                    <!-- Tools Panel -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">
                                <div class="card-title-icon" style="background: rgba(139, 92, 246, 0.1); color: var(--accent-secondary);">🛠️</div>
                                Tools
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="tools-grid">
                                <button class="tool-btn" onclick="runAllTasks()">
                                    <span class="icon">▶️</span>
                                    <span>Run All</span>
                                </button>
                                <button class="tool-btn" onclick="mergeTasks()">
                                    <span class="icon">🔗</span>
                                    <span>Merge</span>
                                </button>
                                <button class="tool-btn" onclick="exportData()">
                                    <span class="icon">💾</span>
                                    <span>Export</span>
                                </button>
                                <button class="tool-btn" onclick="clearCompleted()">
                                    <span class="icon">🧹</span>
                                    <span>Clear</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Rewards -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">
                                <div class="card-title-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--accent-warning);">🏆</div>
                                Rewards
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="xp-container">
                                <div class="xp-header">
                                    <span>Level <span id="userLevel">1</span></span>
                                    <span><span id="currentXP">0</span> / <span id="nextLevelXP">100</span> XP</span>
                                </div>
                                <div class="xp-bar">
                                    <div class="xp-fill" id="xpBar" style="width: 0%"></div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">Badges</div>
                            <div class="badges-container" id="badgesContainer">
                                <div class="badge locked" data-name="First Run">🚀</div>
                                <div class="badge locked" data-name="Streak 7">🔥</div>
                                <div class="badge locked" data-name="Creator">✨</div>
                                <div class="badge locked" data-name="Master">👑</div>
                            </div>

                            <div style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">Activity (Last 28 Days)</div>
                            <div class="heatmap" id="heatmap"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bottom Navigation -->
        <nav class="bottom-nav">
            <a href="#" class="nav-item active" onclick="switchTab('dashboard', event)">
                <span class="nav-icon">🏠</span>
                <span>Home</span>
            </a>
            <a href="#" class="nav-item" onclick="switchTab('tasks', event)">
                <span class="nav-icon">📋</span>
                <span>Tasks</span>
            </a>
            <a href="#" class="nav-item" onclick="openLogsSheet(event)">
                <span class="nav-icon">📜</span>
                <span>Logs</span>
            </a>
            <a href="#" class="nav-item" onclick="switchTab('settings', event)">
                <span class="nav-icon">⚙️</span>
                <span>Settings</span>
            </a>
        </nav>
    </div>

    <!-- Floating Action Button -->
    <button class="fab" id="fab" onclick="openNewTaskModal()">+</button>

    <!-- Logs Sheet -->
    <div class="logs-sheet" id="logsSheet">
        <div class="logs-handle"></div>
        <div class="logs-header">
            <div style="font-weight: 600;">Execution Logs</div>
            <button class="btn-icon" onclick="closeLogsSheet()">✕</button>
        </div>
        <div class="logs-filter">
            <button class="filter-btn active" onclick="filterLogs('all')">All</button>
            <button class="filter-btn" onclick="filterLogs('system')">System</button>
            <button class="filter-btn" onclick="filterLogs('task')">Tasks</button>
            <button class="filter-btn" onclick="filterLogs('reward')">Rewards</button>
        </div>
        <div class="logs-content" id="logsContent"></div>
    </div>

    <!-- Install Prompt -->
    <div class="install-prompt" id="installPrompt">
        <div class="install-content">
            <div class="install-info">
                <div class="install-icon">◆</div>
                <div class="install-text">
                    <div class="install-title">Install MCP Dash</div>
                    <div class="install-subtitle">Add to home screen for offline access</div>
                </div>
            </div>
            <div class="install-buttons">
                <button class="btn-dismiss" onclick="dismissInstall()">Later</button>
                <button class="btn-install" onclick="installApp()">Install</button>
            </div>
        </div>
    </div>

    <!-- Toast Container -->
    <div class="toast-container" id="toastContainer"></div>

    <!-- New Task Modal -->
    <div class="modal-overlay" id="newTaskModal" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 style="font-size: 1.1rem;">Create New Task</h3>
                <button class="btn-icon" onclick="closeModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Task Name</label>
                    <input type="text" class="form-input" id="newTaskName" placeholder="e.g., Daily Graph Sync">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" id="newTaskType">
                        <option value="script">Script</option>
                        <option value="routine">Routine</option>
                        <option value="ai">AI Action</option>
                        <option value="experiment">Experiment</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Ingredients (comma separated)</label>
                    <input type="text" class="form-input" id="newTaskIngredients" placeholder="e.g., GNN, API, Data">
                </div>
                <button class="btn-primary" onclick="createNewTask()">Create Task (+15 XP)</button>
            </div>
        </div>
    </div>

    <script>
        // Utility: Generate UUID
        function generateId() {
            if (crypto.randomUUID) return crypto.randomUUID();
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        }

        // Utility: Haptic feedback
        function haptic(type = 'light') {
            if (navigator.vibrate) {
                const patterns = {
                    light: 10,
                    medium: 20,
                    heavy: 30,
                    success: [10, 50, 10],
                    error: [30, 100, 30]
                };
                navigator.vibrate(patterns[type] || 10);
            }
        }

        // Utility: Debounce
        function debounce(fn, ms) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), ms);
            };
        }

        // State Management
        const state = {
            tasks: [
                { id: generateId(), name: "GNN Universe Sync", type: "script", status: "ready", ingredients: ["GNN", "Graph", "API"], runs: 12, xp: 120 },
                { id: generateId(), name: "Daily Ontology Scan", type: "routine", status: "idle", ingredients: ["Parser", "Matrix"], runs: 45, xp: 450 },
                { id: generateId(), name: "SynthAi Router", type: "ai", status: "ready", ingredients: ["AI", "Routing"], runs: 8, xp: 80 },
                { id: generateId(), name: "PHS Integration Test", type: "experiment", status: "error", ingredients: ["PHS", "Health"], runs: 3, xp: 30 }
            ],
            logs: [],
            xp: 0,
            level: 1,
            streak: 3,
            tasksCompleted: 0,
            runsToday: 0,
            heatmapData: new Array(28).fill(0),
            deferredPrompt: null,
            isOnline: navigator.onLine,
            syncQueue: [],
            selectionMode: false,
            selectedTasks: new Set(),
            logFilter: 'all',
            syncTimeout: null
        };

        // Dynamic file type registry
        const fileTypeRegistry = {
            py: { tags: ['Python', 'Script'], type: 'script' },
            js: { tags: ['JavaScript', 'Script'], type: 'script' },
            ts: { tags: ['TypeScript', 'Script'], type: 'script' },
            json: { tags: ['Config', 'Data'], type: 'config' },
            yaml: { tags: ['Config', 'YAML'], type: 'config' },
            yml: { tags: ['Config', 'YAML'], type: 'config' },
            toml: { tags: ['Config', 'TOML'], type: 'config' },
            md: { tags: ['Documentation', 'Docs'], type: 'doc' },
            txt: { tags: ['Text', 'Note'], type: 'note' },
            default: { tags: ['File'], type: 'file' }
        };

        // XP Curve: Quadratic scaling
        function getNextLevelXP(level) {
            // Quadratic: 100, 200, 400, 700, 1100...
            // Formula: 50 * level * (level + 1)
            return 50 * level * (level + 1);
        }

        // PWA Installation
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            state.deferredPrompt = e;
            setTimeout(() => {
                if (!localStorage.getItem('installDismissed')) {
                    document.getElementById('installPrompt').classList.add('show');
                }
            }, 2000);
        });

        async function installApp() {
            if (!state.deferredPrompt) return;
            state.deferredPrompt.prompt();
            const { outcome } = await state.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                showToast('🎉', 'App Installed', 'MCP Dashboard added to home screen');
            }
            state.deferredPrompt = null;
            document.getElementById('installPrompt').classList.remove('show');
        }

        function dismissInstall() {
            localStorage.setItem('installDismissed', 'true');
            document.getElementById('installPrompt').classList.remove('show');
        }

        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }

        // Online/Offline
        window.addEventListener('online', () => {
            state.isOnline = true;
            document.getElementById('offlineBar').classList.remove('show');
            showToast('🌐', 'Back Online', 'Syncing changes...');
            syncData();
        });

        window.addEventListener('offline', () => {
            state.isOnline = false;
            document.getElementById('offlineBar').classList.add('show');
            showToast('📴', 'Offline Mode', 'Changes saved locally');
        });

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            loadState();
            renderTasks();
            updateMetrics();
            generateHeatmap();
            addLog('system', 'Dashboard initialized', 'info');
            setupPullToRefresh();
            setupFileUpload();
            setupTouchGestures();
        });

        // Selection Mode
        function toggleSelectionMode() {
            state.selectionMode = !state.selectionMode;
            state.selectedTasks.clear();
            updateSelectionUI();
            haptic('medium');
        }

        function updateSelectionUI() {
            document.body.classList.toggle('selection-mode', state.selectionMode);
            document.getElementById('selectionBar').classList.toggle('active', state.selectionMode);
            document.getElementById('mainHeader').style.display = state.selectionMode ? 'none' : 'block';
            document.getElementById('selectBtn').textContent = state.selectionMode ? '✓' : '☐';
            renderTasks();
        }

        function toggleTaskSelection(id) {
            if (!state.selectionMode) return;
            
            if (state.selectedTasks.has(id)) {
                state.selectedTasks.delete(id);
            } else {
                state.selectedTasks.add(id);
                haptic('light');
            }
            
            document.getElementById('selectionCount').textContent = state.selectedTasks.size;
            renderTasks();
        }

        function clearSelection() {
            state.selectionMode = false;
            state.selectedTasks.clear();
            updateSelectionUI();
        }

        function duplicateSelected() {
            const ids = Array.from(state.selectedTasks);
            let count = 0;
            ids.forEach(id => {
                const task = state.tasks.find(t => t.id === id);
                if (task) {
                    const newTask = {
                        ...task,
                        id: generateId(),
                        name: task.name + ' (Copy)',
                        status: 'ready',
                        runs: 0
                    };
                    state.tasks.push(newTask);
                    count++;
                }
            });
            
            if (count > 0) {
                renderTasks();
                const xp = count * 5;
                addXP(xp);
                queueSync({ type: 'duplicate', count, ids });
                addLog('system', `Duplicated ${count} tasks (+${xp} XP)`, 'success');
                showToast('📋', 'Duplicated', `${count} tasks copied`);
                clearSelection();
            }
        }

        function deleteSelected() {
            const count = state.selectedTasks.size;
            if (count === 0) return;
            
            if (confirm(`Delete ${count} selected tasks?`)) {
                state.tasks = state.tasks.filter(t => !state.selectedTasks.has(t.id));
                renderTasks();
                queueSync({ type: 'delete', count });
                addLog('system', `Deleted ${count} tasks`, 'info');
                showToast('🗑', 'Deleted', `${count} tasks removed`);
                clearSelection();
                haptic('heavy');
            }
        }

        // Optimized Rendering
        function renderTasks() {
            const list = document.getElementById('taskList');
            const fragment = document.createDocumentFragment();
            
            state.tasks.forEach(task => {
                const isSelected = state.selectedTasks.has(task.id);
                const item = document.createElement('div');
                item.className = `task-item ${task.status === 'running' ? 'running' : ''} ${isSelected ? 'selected' : ''}`;
                item.dataset.id = task.id;
                
                if (state.selectionMode) {
                    item.onclick = () => toggleTaskSelection(task.id);
                }
                
                item.innerHTML = `
                    ${state.selectionMode ? `<div class="task-checkbox">${isSelected ? '✓' : ''}</div>` : ''}
                    <div class="task-status ${task.status}"></div>
                    <div class="task-info">
                        <div class="task-name">${task.name}</div>
                        <div class="task-meta">
                            <span>${task.type}</span>
                            <span>•</span>
                            <span>${task.runs} runs</span>
                            ${task.ingredients.map(i => `<span class="task-tag">${i}</span>`).join('')}
                        </div>
                    </div>
                    ${!state.selectionMode ? `
                    <div class="task-actions">
                        <button class="btn-icon run" onclick="event.stopPropagation(); runTask('${task.id}')" title="Run">▶</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); duplicateTask('${task.id}')" title="Duplicate">📋</button>
                    </div>
                    ` : ''}
                `;
                fragment.appendChild(item);
            });
            
            list.innerHTML = '';
            list.appendChild(fragment);
            document.getElementById('activeTasks').textContent = state.tasks.filter(t => t.status === 'running').length;
            saveState();
        }

        // Task Actions
        function runTask(id) {
            const task = state.tasks.find(t => t.id === id);
            if (!task || task.status === 'running') return;
            
            task.status = 'running';
            renderTasks();
            addLog('task', `Running "${task.name}"...`, 'info');
            queueSync({ type: 'run', taskId: id });
            haptic('medium');
            
            setTimeout(() => {
                const success = Math.random() > 0.1;
                task.status = success ? 'ready' : 'error';
                if (success) {
                    task.runs++;
                    state.runsToday++;
                    state.tasksCompleted++;
                    updateHeatmap();
                    addXP(10);
                    addLog('task', `"${task.name}" completed (+10 XP)`, 'success');
                    checkBadges();
                    haptic('success');
                } else {
                    addLog('task', `"${task.name}" failed`, 'error');
                    haptic('error');
                }
                renderTasks();
                updateMetrics();
                saveState();
            }, 1500 + Math.random() * 2000);
        }

        function runAllTasks() {
            const eligible = state.tasks.filter(t => t.status !== 'running');
            if (eligible.length === 0) return;
            
            eligible.forEach((task, index) => {
                setTimeout(() => runTask(task.id), index * 500);
            });
            showToast('🚀', 'Batch Started', `Running ${eligible.length} tasks...`);
        }

        function duplicateTask(id) {
            const task = state.tasks.find(t => t.id === id);
            if (!task) return;
            
            const newTask = {
                ...task,
                id: generateId(),
                name: task.name + ' (Copy)',
                status: 'ready',
                runs: 0
            };
            state.tasks.push(newTask);
            renderTasks();
            addXP(5);
            queueSync({ type: 'duplicate', originalId: id });
            addLog('system', `Duplicated "${task.name}" (+5 XP)`, 'success');
            showToast('📋', 'Duplicated', 'Task copy created');
            haptic('light');
        }

        function mergeTasks() {
            showToast('🔗', 'Merge', 'Select 2+ tasks to merge (feature coming)');
        }

        function clearCompleted() {
            const initialCount = state.tasks.length;
            state.tasks = state.tasks.filter(t => t.status !== 'ready' || t.runs === 0);
            const removed = initialCount - state.tasks.length;
            if (removed > 0) {
                renderTasks();
                queueSync({ type: 'clear', count: removed });
                addLog('system', `Cleared ${removed} completed tasks`, 'info');
                showToast('🧹', 'Cleared', `Removed ${removed} tasks`);
            }
        }

        function refreshTasks() {
            const ptr = document.getElementById('ptrIndicator');
            ptr.classList.add('spinning');
            addLog('system', 'Refreshing...', 'info');
            
            setTimeout(() => {
                ptr.classList.remove('spinning');
                renderTasks();
                showToast('🔄', 'Updated', 'Task list refreshed');
            }, 1000);
        }

        // File Upload with dynamic registry
        function setupFileUpload() {
            const dropZone = document.getElementById('dropZone');
            const fileInput = document.getElementById('fileInput');
            
            dropZone.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    processFile(e.target.files[0]);
                }
            });
            
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    processFile(e.dataTransfer.files[0]);
                }
            });
        }

        function processFile(file) {
            const ext = file.name.split('.').pop().toLowerCase();
            const config = fileTypeRegistry[ext] || fileTypeRegistry.default;
            
            const newTask = {
                id: generateId(),
                name: file.name.replace(/\.[^/.]+$/, ""),
                type: config.type,
                status: 'ready',
                ingredients: config.tags,
                runs: 0,
                xp: 0
            };
            
            state.tasks.push(newTask);
            renderTasks();
            addXP(15);
            queueSync({ type: 'upload', filename: file.name });
            addLog('system', `Uploaded "${file.name}" as ${config.type} (+15 XP)`, 'success');
            showToast('📦', 'File Added', `Type: ${config.type}, Tags: ${config.tags.join(', ')}`);
            checkBadges();
            haptic('success');
        }

        // XP System with visual popup
        function addXP(amount) {
            state.xp += amount;
            const nextLevelXP = getNextLevelXP(state.level);
            
            // Show XP popup
            const popup = document.getElementById('xpPopup');
            document.getElementById('xpAmount').textContent = amount;
            popup.classList.add('show');
            setTimeout(() => popup.classList.remove('show'), 1500);
            
            if (state.xp >= nextLevelXP) {
                state.level++;
                state.xp = state.xp - nextLevelXP;
                setTimeout(() => {
                    showToast('🎉', `Level ${state.level}!`, 'Keep up the great work!');
                    addLog('reward', `Reached level ${state.level}`, 'success');
                    haptic('success');
                }, 500);
            }
            
            updateXPDisplay();
            saveState();
        }

        function updateXPDisplay() {
            const nextLevelXP = getNextLevelXP(state.level);
            const percentage = (state.xp / nextLevelXP) * 100;
            
            document.getElementById('userLevel').textContent = state.level;
            document.getElementById('currentXP').textContent = state.xp;
            document.getElementById('nextLevelXP').textContent = nextLevelXP;
            document.getElementById('xpBar').style.width = percentage + '%';
            document.getElementById('totalXP').textContent = state.xp + getTotalXPForLevel(state.level);
        }

        function getTotalXPForLevel(level) {
            // Sum of all previous level requirements
            let total = 0;
            for (let i = 1; i < level; i++) {
                total += getNextLevelXP(i);
            }
            return total;
        }

        function updateMetrics() {
            document.getElementById('runsToday').textContent = state.runsToday;
            document.getElementById('streakDays').textContent = state.streak;
            document.getElementById('tasksCompleted').textContent = state.tasksCompleted;
        }

        function checkBadges() {
            const badges = document.querySelectorAll('.badge');
            const checks = [
                { condition: state.tasksCompleted >= 1, index: 0 },
                { condition: state.streak >= 7, index: 1 },
                { condition: state.tasks.length >= 5, index: 2 },
                { condition: state.level >= 5, index: 3 }
            ];
            
            checks.forEach(({ condition, index }) => {
                if (condition && badges[index].classList.contains('locked')) {
                    badges[index].classList.replace('locked', 'unlocked');
                    showToast('🏆', 'Badge Unlocked!', badges[index].dataset.name);
                    haptic('success');
                }
            });
        }

        // Heatmap tied to actual activity
        function generateHeatmap() {
            const container = document.getElementById('heatmap');
            container.innerHTML = '';
            
            for (let i = 0; i < 28; i++) {
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell';
                cell.dataset.index = i;
                
                // Simulate historical data (last 28 days)
                const daysAgo = 27 - i;
                const date = new Date();
                date.setDate(date.getDate() - daysAgo);
                
                // Check if we have stored activity for this day
                const activity = state.heatmapData[i] || 0;
                if (activity > 0) {
                    const level = Math.min(Math.ceil(activity / 2), 5);
                    cell.classList.add(`level-${level}`);
                }
                
                cell.title = date.toLocaleDateString();
                container.appendChild(cell);
            }
        }

        function updateHeatmap() {
            // Update today (last index)
            state.heatmapData[27] = (state.heatmapData[27] || 0) + 1;
            generateHeatmap();
            
            // Animate the cell
            const cells = document.querySelectorAll('.heatmap-cell');
            const todayCell = cells[27];
            todayCell.classList.add('active');
            setTimeout(() => todayCell.classList.remove('active'), 500);
        }

        // Logs with filtering
        function addLog(source, message, type) {
            const time = new Date().toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit'
            });
            state.logs.unshift({ time, source, message, type, id: generateId() });
            if (state.logs.length > 100) state.logs.pop();
            renderLogs();
        }

        function renderLogs() {
            const container = document.getElementById('logsContent');
            const filtered = state.logFilter === 'all' 
                ? state.logs 
                : state.logs.filter(l => l.source === state.logFilter || l.type === state.logFilter);
            
            container.innerHTML = filtered.map(log => `
                <div class="log-entry" data-id="${log.id}">
                    <span class="log-time">${log.time}</span>
                    <span class="log-type ${log.type}">${log.source}</span>
                    <span class="log-message">${log.message}</span>
                </div>
            `).join('');
        }

        function filterLogs(type) {
            state.logFilter = type;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type) || (type === 'all' && btn.textContent === 'All'));
            });
            renderLogs();
            haptic('light');
        }

        function openLogsSheet(e) {
            if (e) e.preventDefault();
            document.getElementById('logsSheet').classList.add('open');
            document.querySelector('.nav-item:nth-child(3)')?.classList.add('active');
        }

        function closeLogsSheet() {
            document.getElementById('logsSheet').classList.remove('open');
            document.querySelector('.nav-item:nth-child(3)')?.classList.remove('active');
        }

        // Pull to Refresh
        function setupPullToRefresh() {
            let startY = 0;
            let currentY = 0;
            const scroll = document.getElementById('mainScroll');
            const ptr = document.getElementById('ptrIndicator');
            
            scroll.addEventListener('touchstart', (e) => {
                if (scroll.scrollTop === 0) {
                    startY = e.touches[0].pageY;
                }
            }, { passive: true });
            
            scroll.addEventListener('touchmove', (e) => {
                if (startY > 0 && scroll.scrollTop === 0) {
                    currentY = e.touches[0].pageY;
                    const diff = currentY - startY;
                    if (diff > 0 && diff < 100) {
                        ptr.style.transform = `translateX(-50%) translateY(${diff * 0.5}px) rotate(${diff * 2}deg)`;
                        ptr.classList.add('visible');
                    }
                }
            }, { passive: true });
            
            scroll.addEventListener('touchend', () => {
                if (currentY - startY > 80) {
                    ptr.classList.add('spinning');
                    haptic('medium');
                    refreshTasks();
                }
                ptr.style.transform = '';
                ptr.classList.remove('visible');
                startY = 0;
                currentY = 0;
            });
        }

        // Touch Gestures with velocity
        function setupTouchGestures() {
            let startX = 0;
            let startY = 0;
            let startTime = 0;
            let currentX = 0;
            const list = document.getElementById('taskList');
            
            list.addEventListener('touchstart', (e) => {
                if (state.selectionMode) return;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                startTime = Date.now();
                const item = e.target.closest('.task-item');
                if (item) item.classList.add('swiping');
            }, { passive: true });
            
            list.addEventListener('touchmove', (e) => {
                if (state.selectionMode || startX === 0) return;
                const touch = e.touches[0];
                currentX = touch.clientX;
                const diffX = startX - currentX;
                const diffY = Math.abs(startY - touch.clientY);
                
                // Only horizontal swipes
                if (diffY < Math.abs(diffX)) {
                    const item = e.target.closest('.task-item');
                    if (item && diffX > 0) {
                        const translate = Math.min(diffX, 120);
                        item.style.transform = `translateX(-${translate}px)`;
                        item.style.opacity = 1 - (translate / 300);
                    }
                }
            }, { passive: true });
            
            list.addEventListener('touchend', (e) => {
                const item = e.target.closest('.task-item');
                if (!item) return;
                
                item.classList.remove('swiping');
                const diffX = startX - currentX;
                const diffTime = Date.now() - startTime;
                const velocity = diffX / diffTime; // pixels per ms
                
                // Fast swipe or long distance
                if (velocity > 0.5 || diffX > 100) {
                    const id = item.dataset.id;
                    const task = state.tasks.find(t => t.id === id);
                    if (task && confirm(`Delete "${task.name}"?`)) {
                        state.tasks = state.tasks.filter(t => t.id !== id);
                        renderTasks();
                        addLog('system', `Deleted "${task.name}"`, 'info');
                        haptic('heavy');
                    }
                }
                
                item.style.transform = '';
                item.style.opacity = '';
                startX = 0;
                currentX = 0;
            });
        }

        // Modal
        function openNewTaskModal() {
            document.getElementById('newTaskModal').classList.add('active');
            document.getElementById('newTaskName').focus();
            document.getElementById('fab').classList.add('rotate');
        }

        function closeModal(e) {
            if (!e || e.target.classList.contains('modal-overlay')) {
                document.getElementById('newTaskModal').classList.remove('active');
                document.getElementById('fab').classList.remove('rotate');
            }
        }

        function createNewTask() {
            const name = document.getElementById('newTaskName').value.trim();
            const type = document.getElementById('newTaskType').value;
            const ingredients = document.getElementById('newTaskIngredients').value
                .split(',').map(i => i.trim()).filter(i => i);
            
            if (!name) return;
            
            const newTask = {
                id: generateId(),
                name,
                type,
                status: 'ready',
                ingredients: ingredients.length > 0 ? ingredients : ['New'],
                runs: 0,
                xp: 0
            };
            
            state.tasks.push(newTask);
            renderTasks();
            addXP(15);
            queueSync({ type: 'create', task: newTask });
            addLog('system', `Created "${name}" (+15 XP)`, 'success');
            
            closeModal();
            document.getElementById('newTaskName').value = '';
            document.getElementById('newTaskIngredients').value = '';
            
            showToast('✨', 'Task Created', `"${name}" added`);
            checkBadges();
            haptic('success');
        }

        // Navigation
        function switchTab(tab, e) {
            if (e) e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            if (e) e.target.closest('.nav-item').classList.add('active');
        }

        // Toast
        function showToast(icon, title, message) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `
                <div class="toast-icon">${icon}</div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
            `;
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // State Persistence
        function saveState() {
            const data = {
                tasks: state.tasks,
                xp: state.xp,
                level: state.level,
                streak: state.streak,
                tasksCompleted: state.tasksCompleted,
                runsToday: state.runsToday,
                heatmapData: state.heatmapData,
                lastActive: new Date().toISOString()
            };
            localStorage.setItem('mcpState', JSON.stringify(data));
        }

        function loadState() {
            const saved = localStorage.getItem('mcpState');
            if (saved) {
                const data = JSON.parse(saved);
                state.tasks = data.tasks || state.tasks;
                state.xp = data.xp || 0;
                state.level = data.level || 1;
                state.streak = data.streak || 1;
                state.tasksCompleted = data.tasksCompleted || 0;
                state.runsToday = data.runsToday || 0;
                state.heatmapData = data.heatmapData || new Array(28).fill(0);
                
                const lastActive = new Date(data.lastActive);
                const now = new Date();
                if (lastActive.getDate() !== now.getDate()) {
                    state.runsToday = 0;
                    // Shift heatmap
                    state.heatmapData.shift();
                    state.heatmapData.push(0);
                }
            }
        }

        // Batched sync with debounce
        function queueSync(action) {
            state.syncQueue.push({
                action,
                timestamp: new Date().toISOString()
            });
            
            // Debounced sync
            clearTimeout(state.syncTimeout);
            state.syncTimeout = setTimeout(() => {
                if (state.isOnline) syncData();
            }, 5000);
            
            saveState();
        }

        function syncData() {
            if (!state.isOnline || state.syncQueue.length === 0) return;
            
            document.getElementById('syncStatus').classList.add('show');
            
            setTimeout(() => {
                const count = state.syncQueue.length;
                state.syncQueue = [];
                saveState();
                document.getElementById('syncStatus').classList.remove('show');
                if (count > 0) {
                    showToast('☁️', 'Sync Complete', `${count} changes synced`);
                }
            }, 1500);
        }

        // Export data
        function exportData() {
            const data = {
                tasks: state.tasks,
                xp: state.xp,
                level: state.level,
                exportDate: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mcp-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('💾', 'Exported', 'Data saved to downloads');
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (state.selectionMode) {
                    clearSelection();
                } else {
                    closeModal();
                }
            }
            if (e.key === 'n' && e.ctrlKey) {
                e.preventDefault();
                openNewTaskModal();
            }
        });
    </script>
</body>
</html>
