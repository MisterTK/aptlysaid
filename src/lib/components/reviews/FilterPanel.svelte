<script lang="ts">
  // Removed unused createEventDispatcher import
  import { fly } from "svelte/transition"
  import { cubicOut } from "svelte/easing"
  import type { FilterState } from "$lib/types"

  interface Props {
    filters: FilterState
    resultCount: number
    onFiltersChange?: (filters: FilterState) => void
    stats?: {
      needAction: number
      inQueue: number
      published: number
      fiveStar: number
      fourStar: number
      threeStar: number
      twoStar: number
      oneStar: number
    }
  }

  let {
    filters,
    resultCount,
    onFiltersChange,
    stats = {
      needAction: 0,
      inQueue: 0,
      published: 0,
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
    },
  }: Props = $props()

  // Removed unused dispatch
  
  let isCollapsed = $state(false)
  // Removed unused showGuidance
  // Removed unused editing guidance state variables

  // Filter states
  let selectedStatuses = $state(new Set(filters.status))
  let selectedRatings = $state(new Set(filters.rating.map((r) => r.toString())))
  let selectedDateRange = $state(filters.dateRange || "last7days")

  // Animation states - removed unused guidanceHeight

  function toggleStatus(status: string) {
    if (selectedStatuses.has(status)) {
      selectedStatuses.delete(status)
    } else {
      selectedStatuses.add(status)
    }
    selectedStatuses = new Set(selectedStatuses)
    updateFilters()
  }

  function toggleRating(rating: string) {
    if (selectedRatings.has(rating)) {
      selectedRatings.delete(rating)
    } else {
      selectedRatings.add(rating)
    }
    selectedRatings = new Set(selectedRatings)
    updateFilters()
  }

  function updateFilters() {
    const newFilters: FilterState = {
      status: Array.from(selectedStatuses),
      rating: Array.from(selectedRatings).map((r) => parseInt(r)),
      dateRange: selectedDateRange,
    }
    onFiltersChange?.(newFilters)
  }

  // Removed unused functions: toggleGuidanceEdit, saveGuidance, addUpsellItem, removeUpsellItem

  function togglePanel() {
    isCollapsed = !isCollapsed
  }
</script>

<div class="filter-panel" class:collapsed={isCollapsed}>
  <div class="panel-container">
    <!-- Header -->
    <div class="panel-header">
      <h3 class="panel-title">
        <svg
          class="title-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M3 4h18M3 12h18M3 20h12"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        Filters & Settings
      </h3>
      <button
        class="toggle-button"
        onclick={togglePanel}
        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
      >
        <svg
          class="toggle-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M15 18l-6-6 6-6"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    {#if !isCollapsed}
      <div
        class="panel-content custom-scrollbar"
        transition:fly={{ x: -20, duration: 300, easing: cubicOut }}
      >
        <!-- Result Count -->
        <div class="result-count">
          <span class="count-value">{resultCount}</span>
          <span class="count-label">Results</span>
        </div>

        <!-- Status Filters -->
        <div class="filter-section">
          <h4 class="section-title">Status</h4>
          <div class="filter-options">
            <label class="filter-option status-option">
              <input
                type="checkbox"
                class="option-checkbox"
                checked={selectedStatuses.has("unreplied")}
                onchange={() => toggleStatus("unreplied")}
              />
              <div class="option-content">
                <span class="option-label">Unreplied</span>
                <span class="option-count">{stats.needAction}</span>
              </div>
            </label>

            <label class="filter-option status-option">
              <input
                type="checkbox"
                class="option-checkbox"
                checked={selectedStatuses.has("replied")}
                onchange={() => toggleStatus("replied")}
              />
              <div class="option-content">
                <span class="option-label">Replied</span>
                <span class="option-count">{stats.published}</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Rating Filters -->
        <div class="filter-section">
          <h4 class="section-title">Rating</h4>
          <div class="filter-options">
            <label class="filter-option rating-option">
              <input
                type="checkbox"
                class="option-checkbox"
                checked={selectedRatings.has("5")}
                onchange={() => toggleRating("5")}
              />
              <div class="option-content">
                <span class="option-label">
                  <span class="stars">★★★★★</span>
                </span>
                <span class="option-count">{stats.fiveStar}</span>
              </div>
            </label>

            <label class="filter-option rating-option">
              <input
                type="checkbox"
                class="option-checkbox"
                checked={selectedRatings.has("4")}
                onchange={() => toggleRating("4")}
              />
              <div class="option-content">
                <span class="option-label">
                  <span class="stars">★★★★</span>
                </span>
                <span class="option-count">{stats.fourStar}</span>
              </div>
            </label>

            <label class="filter-option rating-option">
              <input
                type="checkbox"
                class="option-checkbox"
                checked={selectedRatings.has("3") ||
                  selectedRatings.has("2") ||
                  selectedRatings.has("1")}
                onchange={() => {
                  if (
                    selectedRatings.has("3") ||
                    selectedRatings.has("2") ||
                    selectedRatings.has("1")
                  ) {
                    selectedRatings.delete("3")
                    selectedRatings.delete("2")
                    selectedRatings.delete("1")
                  } else {
                    selectedRatings.add("3")
                    selectedRatings.add("2")
                    selectedRatings.add("1")
                  }
                  selectedRatings = new Set(selectedRatings)
                  updateFilters()
                }}
              />
              <div class="option-content">
                <span class="option-label">
                  <span class="stars">★★★</span> or below
                </span>
                <span class="option-count"
                  >{stats.threeStar + stats.twoStar + stats.oneStar}</span
                >
              </div>
            </label>
          </div>
        </div>

        <!-- Date Range -->
        <div class="filter-section">
          <h4 class="section-title">Date Range</h4>
          <div class="date-options">
            <label class="date-option">
              <input
                type="radio"
                name="dateRange"
                class="date-radio"
                checked={selectedDateRange === "last7days"}
                onchange={() => {
                  selectedDateRange = "last7days"
                  updateFilters()
                }}
              />
              <span class="date-label">Last 7 days</span>
            </label>

            <label class="date-option">
              <input
                type="radio"
                name="dateRange"
                class="date-radio"
                checked={selectedDateRange === "last30days"}
                onchange={() => {
                  selectedDateRange = "last30days"
                  updateFilters()
                }}
              />
              <span class="date-label">Last 30 days</span>
            </label>

            <label class="date-option">
              <input
                type="radio"
                name="dateRange"
                class="date-radio"
                checked={selectedDateRange === "allTime"}
                onchange={() => {
                  selectedDateRange = "allTime"
                  updateFilters()
                }}
              />
              <span class="date-label">All time</span>
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .filter-panel {
    width: 100%;
    background: white;
    transition: all 0.3s;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .filter-panel.collapsed {
    .panel-title {
      opacity: 0;
    }
  }

  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
    transition: opacity 0.2s;
  }

  .collapsed .panel-title {
    opacity: 0;
  }

  .title-icon {
    color: #6366f1;
    flex-shrink: 0;
  }

  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    color: #6b7280;
    transition: all 0.2s;
    cursor: pointer;
  }

  .toggle-button:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #111827;
  }

  .toggle-icon {
    transition: transform 0.2s;
  }

  .collapsed .toggle-icon {
    transform: rotate(180deg);
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  /* Result Count */
  .result-count {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 1rem;
    background: #eef2ff;
    border: 1px solid #e0e7ff;
    border-radius: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .count-value {
    font-size: 2rem;
    font-weight: 700;
    color: #6366f1;
  }

  .count-label {
    font-size: 0.875rem;
    color: #6366f1;
    opacity: 0.8;
  }

  /* Filter Sections */
  .filter-section {
    margin-bottom: 2rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }

  /* Filter Options */
  .filter-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-option {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-option:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .option-checkbox {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .filter-option:has(.option-checkbox:checked) {
    background: #eef2ff;
    border-color: #e0e7ff;
  }

  .option-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-left: 24px;
  }

  .filter-option::before {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid #d1d5db;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .filter-option:has(.option-checkbox:checked)::before {
    background: #6366f1;
    border-color: #6366f1;
  }

  .filter-option:has(.option-checkbox:checked)::after {
    content: "";
    position: absolute;
    left: 5px;
    top: 50%;
    transform: translateY(-50%) rotate(45deg);
    width: 4px;
    height: 8px;
    border: 2px solid white;
    border-top: none;
    border-left: none;
  }

  .option-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
  }

  .option-count {
    font-size: 0.75rem;
    font-weight: 500;
    color: #9ca3af;
    background: #f9fafb;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .filter-option:has(.option-checkbox:checked) .option-count {
    background: #e0e7ff;
    color: #6366f1;
  }

  /* Rating Stars */
  .stars {
    color: #f59e0b;
  }

  /* Date Options */
  .date-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .date-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .date-option:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .date-radio {
    width: 16px;
    height: 16px;
    accent-color: #6366f1;
  }

  .date-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
  }

  .date-option:has(.date-radio:checked) {
    background: #eef2ff;
    border-color: #e0e7ff;
  }

  /* AI Section */
  .ai-section {
    border-top: 1px solid #e5e7eb;
    padding-top: 1.5rem;
  }

  .ai-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ai-section-header:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .ai-header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ai-icon {
    color: #6366f1;
  }

  .chevron-icon {
    color: #9ca3af;
    transition: transform 0.2s;
  }

  .chevron-icon.rotated {
    transform: rotate(90deg);
  }

  /* Guidance Content */
  .guidance-content {
    padding: 1rem 0;
  }

  .guidance-field {
    margin-bottom: 1.5rem;
  }

  .field-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }

  .voice-textarea {
    width: 100%;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #111827;
    resize: vertical;
    transition: all 0.2s;
  }

  .voice-textarea:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px #e0e7ff;
  }

  .voice-display {
    padding: 0.75rem;
    background: #f3f4f6;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #111827;
    line-height: 1.5;
  }

  /* Upsell Items */
  .upsell-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .upsell-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: #f3f4f6;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .upsell-name {
    color: #111827;
  }

  .remove-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-button:hover {
    color: #ef4444;
  }

  /* Add Item */
  .add-item-container {
    display: flex;
    gap: 0.5rem;
  }

  .add-item-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #111827;
    transition: all 0.2s;
  }

  .add-item-input:focus {
    outline: none;
    border-color: #6366f1;
  }

  .add-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: #6366f1;
    border: none;
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-button:hover {
    background: #4f46e5;
    transform: translateY(-1px);
  }

  /* Edit Button */
  .edit-button {
    width: 100%;
    padding: 0.75rem;
    background: #6366f1;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .edit-button:hover {
    background: #4f46e5;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .filter-panel {
      width: 100%;
    }

    .filter-panel.collapsed {
      display: none;
    }
  }
</style>
