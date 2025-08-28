<script lang="ts">
  import { onMount } from "svelte"
  import type { PageData } from "./$types"

  export let data: PageData

  let selectedTab = "overview"
  let workflows: unknown[] = []
  let monitoring: Record<string, unknown> = {}
  let loading = false
  let error = ""

  const tabs = [
    { id: "overview", name: "Overview", icon: "📊" },
    { id: "workflows", name: "Workflows", icon: "🔄" },
    { id: "queues", name: "Queue Health", icon: "📋" },
    { id: "metrics", name: "Metrics", icon: "📈" },
    { id: "alerts", name: "Alerts", icon: "🚨" },
  ]

  onMount(() => {
    loadData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  })

  async function loadData() {
    loading = true
    error = ""

    try {
      const [workflowsRes, monitoringRes] = await Promise.all([
        fetch("/account/api/workflows?limit=50"),
        fetch(`/account/api/workflows/monitoring?view=${selectedTab}`),
      ])

      if (!workflowsRes.ok || !monitoringRes.ok) {
        throw new Error("Failed to load data")
      }

      const workflowsData = await workflowsRes.json()
      const monitoringData = await monitoringRes.json()

      workflows = workflowsData.workflows || []
      monitoring = monitoringData
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error"
      console.error("Error loading data:", err)
    } finally {
      loading = false
    }
  }

  async function startWorkflow(type: string) {
    try {
      const response = await fetch("/account/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_type: type }),
      })

      if (!response.ok) {
        throw new Error("Failed to start workflow")
      }

      await loadData()
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to start workflow"
    }
  }

  async function retryWorkflow(executionId: string) {
    try {
      const response = await fetch("/account/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: executionId, action: "retry" }),
      })

      if (!response.ok) {
        throw new Error("Failed to retry workflow")
      }

      await loadData()
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to retry workflow"
    }
  }

  async function cancelWorkflow(executionId: string) {
    try {
      const response = await fetch("/account/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: executionId, action: "cancel" }),
      })

      if (!response.ok) {
        throw new Error("Failed to cancel workflow")
      }

      await loadData()
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to cancel workflow"
    }
  }

  function getStatusBadge(status: string) {
    const badges = {
      pending: "badge-warning",
      processing: "badge-info",
      completed: "badge-success",
      failed: "badge-error",
      retrying: "badge-warning",
      cancelled: "badge-neutral",
    }
    return badges[status] || "badge-neutral"
  }

  function formatDuration(startTime: string, endTime?: string) {
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const diff = end.getTime() - start.getTime()

    if (diff < 60000) return `${Math.round(diff / 1000)}s`
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`
    return `${Math.round(diff / 3600000)}h`
  }

  $: if (selectedTab) {
    loadData()
  }
</script>

<svelte:head>
  <title>Workflow Management - Reviews</title>
</svelte:head>

<div class="container mx-auto p-6">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-3xl font-bold">Workflow Management</h1>
      <p class="text-base-content/70 mt-1">
        Monitor and manage background workflows
      </p>
    </div>

    <div class="flex gap-2">
      <button
        class="btn btn-primary btn-sm"
        onclick={() => startWorkflow("gmb_sync")}
        disabled={loading}
      >
        🔄 Start Sync
      </button>

      <button
        class="btn btn-secondary btn-sm"
        onclick={() => startWorkflow("review_processing")}
        disabled={loading}
      >
        🤖 Generate AI Responses
      </button>

      <button
        class="btn btn-outline btn-sm"
        onclick={loadData}
        disabled={loading}
      >
        {#if loading}
          <span class="loading loading-spinner loading-sm"></span>
        {:else}
          🔄 Refresh
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error mb-4">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Tab Navigation -->
  <div class="tabs tabs-boxed mb-6">
    {#each tabs as tab (tab.id)}
      <button
        class="tab {selectedTab === tab.id ? 'tab-active' : ''}"
        onclick={() => (selectedTab = tab.id)}
      >
        {tab.icon}
        {tab.name}
      </button>
    {/each}
  </div>

  <!-- Tab Content -->
  {#if selectedTab === "overview"}
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="stat bg-base-200 rounded-lg">
        <div class="stat-title">Workflows (24h)</div>
        <div class="stat-value text-primary">
          {monitoring.overview?.workflows_24h || 0}
        </div>
        <div class="stat-desc">Total executions</div>
      </div>

      <div class="stat bg-base-200 rounded-lg">
        <div class="stat-title">Success Rate</div>
        <div class="stat-value text-success">
          {monitoring.overview?.success_rate || 0}%
        </div>
        <div class="stat-desc">
          {monitoring.overview?.workflows_completed || 0} completed
        </div>
      </div>

      <div class="stat bg-base-200 rounded-lg">
        <div class="stat-title">Failed</div>
        <div class="stat-value text-error">
          {monitoring.overview?.workflows_failed || 0}
        </div>
        <div class="stat-desc">Requires attention</div>
      </div>

      <div class="stat bg-base-200 rounded-lg">
        <div class="stat-title">Active</div>
        <div class="stat-value text-info">
          {monitoring.overview?.workflows_active || 0}
        </div>
        <div class="stat-desc">Currently running</div>
      </div>
    </div>

    <!-- Active Workflows -->
    {#if monitoring.active_workflows?.length > 0}
      <div class="card bg-base-200 mb-6">
        <div class="card-body">
          <h3 class="card-title">Active Workflows</h3>
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Step</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each monitoring.active_workflows as workflow (workflow.id)}
                  <tr>
                    <td class="font-medium">{workflow.workflow_type || workflow.workflow_name}</td>
                    <td>{workflow.current_step}</td>
                    <td>
                      <span
                        class="badge {getStatusBadge(workflow.status)} badge-sm"
                      >
                        {workflow.status}
                      </span>
                    </td>
                    <td>{formatDuration(workflow.created_at)}</td>
                    <td>
                      <div class="flex gap-1">
                        {#if workflow.status === "failed"}
                          <button
                            class="btn btn-ghost btn-xs"
                            onclick={() => retryWorkflow(workflow.id)}
                          >
                            🔄 Retry
                          </button>
                        {/if}
                        {#if ["pending", "processing", "retrying"].includes(workflow.status)}
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            onclick={() => cancelWorkflow(workflow.id)}
                          >
                            ❌ Cancel
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}

    <!-- Queue Stats -->
    {#if monitoring.queue_stats && Object.keys(monitoring.queue_stats).length > 0}
      <div class="card bg-base-200">
        <div class="card-body">
          <h3 class="card-title">Queue Statistics (Last Hour)</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each Object.entries(monitoring.queue_stats) as [queue, stats] (queue)}
              <div class="stat bg-base-100 rounded">
                <div class="stat-title text-xs">{queue.replace("_", " ")}</div>
                <div class="stat-value text-lg">{stats.processed}</div>
                <div class="stat-desc">
                  {stats.failed} failed | {Math.round(stats.avg_time || 0)}ms
                  avg
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  {:else if selectedTab === "workflows"}
    <div class="card bg-base-200">
      <div class="card-body">
        <h3 class="card-title">Recent Workflows</h3>
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Step</th>
                <th>Status</th>
                <th>Created</th>
                <th>Duration</th>
                <th>Retries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each workflows as workflow (workflow.id)}
                <tr>
                  <td class="font-medium">{workflow.workflow_type || workflow.workflow_name}</td>
                  <td>{workflow.current_step}</td>
                  <td>
                    <span class="badge {getStatusBadge(workflow.status)}">
                      {workflow.status}
                    </span>
                  </td>
                  <td>{new Date(workflow.created_at).toLocaleString()}</td>
                  <td>
                    {workflow.completed_at
                      ? formatDuration(
                          workflow.created_at,
                          workflow.completed_at,
                        )
                      : formatDuration(workflow.created_at)}
                  </td>
                  <td>{workflow.retry_count}</td>
                  <td>
                    <div class="flex gap-1">
                      {#if workflow.status === "failed"}
                        <button
                          class="btn btn-ghost btn-xs"
                          onclick={() => retryWorkflow(workflow.id)}
                        >
                          🔄 Retry
                        </button>
                      {/if}
                      {#if ["pending", "processing", "retrying"].includes(workflow.status)}
                        <button
                          class="btn btn-ghost btn-xs text-error"
                          onclick={() => cancelWorkflow(workflow.id)}
                        >
                          ❌ Cancel
                        </button>
                      {/if}
                      {#if workflow.error_details}
                        <button
                          class="btn btn-ghost btn-xs"
                          onclick={() =>
                            alert(
                              JSON.stringify(workflow.error_details, null, 2),
                            )}
                        >
                          ⚠️ View Error
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {:else if selectedTab === "queues"}
    {#if monitoring.queue_health}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {#each monitoring.queue_health as queue (queue.name)}
          <div class="card bg-base-200">
            <div class="card-body">
              <div class="flex justify-between items-start">
                <h3 class="card-title text-sm">{queue.queue_name}</h3>
                <span
                  class="badge {queue.health_status === 'HEALTHY'
                    ? 'badge-success'
                    : queue.health_status === 'WARNING'
                      ? 'badge-warning'
                      : 'badge-error'}"
                >
                  {queue.health_status}
                </span>
              </div>

              <div class="stats stats-horizontal">
                <div class="stat">
                  <div class="stat-title text-xs">Queue Length</div>
                  <div class="stat-value text-lg">{queue.queue_length}</div>
                </div>
                <div class="stat">
                  <div class="stat-title text-xs">Success Rate</div>
                  <div class="stat-value text-lg">
                    {Math.round((queue.success_rate || 0) * 100)}%
                  </div>
                </div>
              </div>

              <div class="text-sm opacity-70">
                Processed: {queue.processed_last_hour} | Failed: {queue.failed_last_hour}
                | Avg: {Math.round(queue.avg_processing_time_ms || 0)}ms
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else if selectedTab === "metrics"}
    {#if monitoring.workflow_metrics}
      <div class="card bg-base-200">
        <div class="card-body">
          <h3 class="card-title">Workflow Performance (24h)</h3>
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Workflow Type</th>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Avg Duration</th>
                  <th>P95 Duration</th>
                  <th>Success Rate</th>
                  <th>Max Retries</th>
                </tr>
              </thead>
              <tbody>
                {#each monitoring.workflow_metrics as metric (metric.id || metric.workflow_type)}
                  <tr>
                    <td class="font-medium">{metric.workflow_type || metric.workflow_name}</td>
                    <td>
                      <span class="badge {getStatusBadge(metric.status)}">
                        {metric.status}
                      </span>
                    </td>
                    <td>{metric.count}</td>
                    <td>{Math.round(metric.avg_duration_seconds || 0)}s</td>
                    <td>{Math.round(metric.p95_duration || 0)}s</td>
                    <td>{Math.round((metric.success_rate || 0) * 100)}%</td>
                    <td>{metric.max_retries}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}
  {:else if selectedTab === "alerts"}
    {#if monitoring.alerts && monitoring.alerts.length > 0}
      <div class="space-y-2">
        {#each monitoring.alerts as alert (alert.id)}
          <div
            class="alert {alert.severity === 'CRITICAL'
              ? 'alert-error'
              : 'alert-warning'}"
          >
            <span class="font-semibold">{alert.alert_type}:</span>
            <span>{alert.message}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="alert alert-success">
        <span>✅ No active alerts - all systems operating normally</span>
      </div>
    {/if}
  {/if}
</div>
