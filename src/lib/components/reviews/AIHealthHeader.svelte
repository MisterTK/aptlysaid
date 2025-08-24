<script lang="ts">
  // Removed unused transition imports

  interface Props {
    approvalRate: number
    queueCount: number
    nextPublishTime?: string
    onRefresh?: () => void
  }

  let {
    approvalRate = 92,
    queueCount = 0,
    nextPublishTime = "2m",
    onRefresh,
  }: Props = $props()

  let isRefreshing = $state(false)

  async function handleRefresh() {
    if (isRefreshing) return
    isRefreshing = true
    await onRefresh?.()
    setTimeout(() => {
      isRefreshing = false
    }, 1000)
  }

  function getHealthStatus(rate: number) {
    if (rate >= 90) return { color: "success", icon: "✅", text: "Excellent" }
    if (rate >= 70) return { color: "warning", icon: "⚠️", text: "Good" }
    return { color: "error", icon: "❌", text: "Needs Attention" }
  }

  const healthStatus = $derived(getHealthStatus(approvalRate))
</script>

<header class="ai-health-header">
  <div class="header-backdrop"></div>
  <div class="header-content">
    <!-- Logo Section -->
    <div class="logo-section">
      <div class="logo-container">
        <span class="logo-text">AptlySaid</span>
        <span class="logo-badge">AI</span>
      </div>
    </div>

    <!-- Metrics Section -->
    <div class="metrics-container">
      <!-- AI Health Metric -->
      <div class="metric-card health-metric" data-status={healthStatus.color}>
        <div class="metric-header">
          <span class="metric-label">AI Health</span>
          <span class="health-icon">{healthStatus.icon}</span>
        </div>
        <div class="metric-value-container">
          <div class="metric-value">{approvalRate}%</div>
          <div class="metric-subtext">{healthStatus.text}</div>
        </div>
        <div class="health-bar">
          <div class="health-bar-fill" style="width: {approvalRate}%"></div>
        </div>
      </div>

      <!-- Queue Metric -->
      <div class="metric-card queue-metric">
        <div class="metric-header">
          <span class="metric-label">Queue</span>
          <div class="queue-indicator" class:active={queueCount > 0}>
            <span class="indicator-dot"></span>
          </div>
        </div>
        <div class="metric-value-container">
          <div class="metric-value">{queueCount}</div>
          <div class="metric-subtext">Items</div>
        </div>
      </div>

      <!-- Next Publish Metric -->
      <div class="metric-card publish-metric">
        <div class="metric-header">
          <span class="metric-label">Next Publish</span>
          <svg
            class="clock-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10" stroke-width="2" />
            <path d="M12 6v6l4 2" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
        <div class="metric-value-container">
          <div class="metric-value">{nextPublishTime || "—"}</div>
          <div class="metric-subtext">
            {queueCount > 0 ? "Scheduled" : "No items"}
          </div>
        </div>
      </div>
    </div>

    <!-- Actions Section -->
    <div class="actions-section">
      <button
        class="refresh-button"
        onclick={handleRefresh}
        disabled={isRefreshing}
        title="Refresh data"
        aria-label="Refresh data"
      >
        <svg
          class="refresh-icon"
          class:animate-spin={isRefreshing}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      <button class="settings-button" title="Settings" aria-label="Settings">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="3" stroke-width="2" />
          <path
            d="M12 1v6m0 6v6m3.464-13.535l4.243 4.243M4.757 16.757l4.243 4.243m0-13.456L4.757 3.301m13.486 13.456l4.243 4.243"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</header>

<style>
  .ai-health-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .header-backdrop {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, white 0%, #f3f4f6 100%);
    opacity: 0.8;
  }

  .header-content {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    gap: 2rem;
    max-width: 1920px;
    margin: 0 auto;
  }

  /* Logo Section */
  .logo-section {
    flex-shrink: 0;
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .logo-text {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #1a2e5c;
  }

  .logo-badge {
    background: #e0e7ff;
    color: #6366f1;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* Metrics Container */
  .metrics-container {
    display: flex;
    gap: 1.5rem;
    flex: 1;
    justify-content: center;
  }

  .metric-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 1rem;
    padding: 1rem 1.5rem;
    min-width: 160px;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border-color: #d1d5db;
  }

  .metric-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .metric-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric-value-container {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .metric-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #111827;
    line-height: 1;
  }

  .metric-subtext {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Health Metric Specific */
  .health-metric[data-status="success"] {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .health-metric[data-status="warning"] {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .health-metric[data-status="error"] {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .health-icon {
    font-size: 1rem;
  }

  .health-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #e5e7eb;
  }

  .health-bar-fill {
    height: 100%;
    background: currentColor;
    transition: width 0.3s;
  }

  .health-metric[data-status="success"] .health-bar-fill {
    background: #10b981;
  }

  .health-metric[data-status="warning"] .health-bar-fill {
    background: #f59e0b;
  }

  .health-metric[data-status="error"] .health-bar-fill {
    background: #ef4444;
  }

  /* Queue Indicator */
  .queue-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  .indicator-dot {
    width: 8px;
    height: 8px;
    background: #9ca3af;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .queue-indicator.active .indicator-dot {
    background: #10b981;
    box-shadow: 0 0 0 4px #bbf7d0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.8;
    }
  }

  /* Clock Icon */
  .clock-icon {
    color: #6366f1;
  }

  /* Actions Section */
  .actions-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .refresh-button,
  .settings-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    color: #6b7280;
    transition: all 0.2s;
    cursor: pointer;
  }

  .refresh-button:hover:not(:disabled),
  .settings-button:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #111827;
    transform: translateY(-1px);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  .refresh-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon,
  .settings-button svg {
    transition: transform 0.2s;
  }

  .refresh-button:hover:not(:disabled) .refresh-icon {
    transform: rotate(90deg);
  }

  /* Mobile Responsive */
  @media (max-width: 1024px) {
    .header-content {
      padding: 1rem;
    }

    .metrics-container {
      gap: 1rem;
    }

    .metric-card {
      min-width: 140px;
      padding: 0.875rem 1.25rem;
    }

    .metric-value {
      font-size: 1.5rem;
    }
  }

  @media (max-width: 768px) {
    .header-content {
      flex-wrap: wrap;
      gap: 1rem;
    }

    .logo-section {
      order: 1;
    }

    .actions-section {
      order: 2;
      margin-left: auto;
    }

    .metrics-container {
      order: 3;
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.5rem;
      -webkit-overflow-scrolling: touch;
    }

    .metric-card {
      flex-shrink: 0;
    }
  }

  @media (max-width: 640px) {
    .metric-value {
      font-size: 1.25rem;
    }

    .metric-subtext {
      font-size: 0.75rem;
    }
  }
</style>
