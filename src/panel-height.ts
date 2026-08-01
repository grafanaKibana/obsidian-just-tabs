const FLOOR_CAP_MS = 2500;

// Dataview, Datacore and mermaid render an empty container from the markdown
// post-processor and fill it whenever their query resolves; an unresolved
// internal embed has the same shape. Until then the panel measures as though it
// holds nothing at all.
const PENDING_SELECTOR =
	'[class*="block-language-"]:empty, .internal-embed:empty';

const TRANSITION_EVENTS = [
	"transitionstart",
	"transitionend",
	"transitioncancel",
] as const;

export interface PanelHeightTracker {
	// Pin the height being left behind, then move to whichever panel is visible.
	switched(from: number): void;
	// Re-read the visible panel, for a change no resize reports.
	refresh(): void;
	destroy(): void;
}

// The box follows the visible panel's height for as long as it is mounted rather
// than measuring a target once and animating at it. A height measured the moment
// a panel appears is a guess about content that has not finished arriving, and
// every one of those guesses ends as a visible jump when the guess expires.
export function trackPanelHeight(
	panelsEl: HTMLElement,
	isLoading: () => boolean = () => false,
): PanelHeightTracker {
	const view = panelsEl.ownerDocument.defaultView;
	let observer: ResizeObserver | undefined;
	let watched: HTMLElement | undefined;
	let floor = 0;
	let floorTimer: number | undefined;
	let settleFrame: number | undefined;
	let target = 0;
	let minimum = 0;
	let transitioning = false;
	// Until the first switch the box is left on its own height, so a block still
	// rendering when its note opens grows the way any other content does. Pinning
	// that early would fix the box before anything is watching it.
	let tracking = false;

	// Scoped to the visible panel: a hidden panel keeps its own unfilled
	// containers in the tree, and those must not hold the floor down.
	const visiblePanel = (): HTMLElement | null =>
		panelsEl.querySelector<HTMLElement>(
			":scope > .tabsdown__panel:not([hidden])",
		);

	const dropFloor = (): void => {
		floor = 0;
		if (floorTimer !== undefined) {
			view?.clearTimeout(floorTimer);
			floorTimer = undefined;
		}
	};
	const pixels = (value: string | undefined): number => {
		const parsed = Number.parseFloat(value ?? "");
		return Number.isFinite(parsed) ? parsed : 0;
	};
	const measure = (
		panel: HTMLElement | null,
	): { content: number; natural: number } => {
		if (!panel) return { content: 0, natural: 0 };
		const pinned = panelsEl.style.height;
		const reserved = panelsEl.style.minHeight;
		panelsEl.style.removeProperty("height");
		panelsEl.style.removeProperty("min-height");
		const style = view?.getComputedStyle(panel);
		const content =
			panel.getBoundingClientRect().height +
			pixels(style?.marginTop) +
			pixels(style?.marginBottom);
		const natural = panelsEl.getBoundingClientRect().height;
		if (pinned) panelsEl.style.height = pinned;
		if (reserved) panelsEl.style.minHeight = reserved;
		return { content, natural };
	};

	const apply = (): void => {
		if (!tracking) return;
		const panel = visiblePanel();
		// The floor outlives the switch only while content is still on its way, so
		// a panel that is merely shorter than the last one shrinks straight away.
		const holding =
			floor > 0 &&
			(isLoading() || panel?.querySelector(PENDING_SELECTOR) != null);
		if (!holding) dropFloor();
		const measured = measure(panel);
		// Rounding up: half a pixel short is a clipped descender for as long as the
		// container is clipping its overflow.
		target = Math.ceil(
			holding ? Math.max(measured.content, floor) : measured.content,
		);
		minimum = measured.natural < target ? target : 0;
		const value = `${target}px`;
		if (transitioning) {
			if (panelsEl.style.height !== value) panelsEl.style.height = value;
		} else if (minimum > 0) {
			if (panelsEl.style.minHeight !== `${minimum}px`) {
				panelsEl.style.minHeight = `${minimum}px`;
			}
		} else {
			panelsEl.style.removeProperty("min-height");
		}
	};
	const watch = (panel: HTMLElement | null): void => {
		if (panel === (watched ?? null)) return;
		if (watched) observer?.unobserve(watched);
		watched = panel ?? undefined;
		if (watched) observer?.observe(watched);
	};
	const settle = (): void => {
		settleFrame = undefined;
		transitioning = false;
		if (minimum > 0) {
			panelsEl.style.minHeight = `${minimum}px`;
		} else {
			panelsEl.style.removeProperty("min-height");
		}
		panelsEl.style.removeProperty("height");
		panelsEl.classList.remove("tabsdown__panels--animating");
	};
	const scheduleSettle = (): void => {
		if (!view) {
			settle();
			return;
		}
		if (settleFrame !== undefined) view.cancelAnimationFrame(settleFrame);
		settleFrame = view.requestAnimationFrame(settle);
	};

	const onTransition = (event: TransitionEvent): void => {
		if (event.target !== panelsEl || event.propertyName !== "height") return;
		if (event.type === "transitionstart") {
			if (settleFrame !== undefined) {
				view?.cancelAnimationFrame(settleFrame);
				settleFrame = undefined;
			}
			panelsEl.classList.add("tabsdown__panels--animating");
			return;
		}
		// Retargeting mid-flight cancels one transition and starts another in the
		// same frame, so releasing on the next one keeps the clip on across the gap.
		scheduleSettle();
	};

	for (const type of TRANSITION_EVENTS) {
		panelsEl.addEventListener(type, onTransition as EventListener);
	}

	return {
		switched(from: number): void {
			tracking = true;
			floor = from;
			if (floorTimer !== undefined) view?.clearTimeout(floorTimer);
			floorTimer = view?.setTimeout(() => {
				floorTimer = undefined;
				dropFloor();
				apply();
			}, FLOOR_CAP_MS);
			if (!observer && view?.ResizeObserver) {
				observer = new view.ResizeObserver(apply);
			}
			watch(visiblePanel());
			if (settleFrame !== undefined) view?.cancelAnimationFrame(settleFrame);
			panelsEl.style.removeProperty("min-height");
			panelsEl.style.height = `${Math.ceil(from)}px`;
			// Flushing the pin makes it the value the transition starts from. Both
			// writes otherwise land in one frame and the box jumps to the target.
			void panelsEl.offsetHeight;
			transitioning = true;
			apply();
			scheduleSettle();
		},

		refresh: apply,

		destroy(): void {
			tracking = false;
			dropFloor();
			observer?.disconnect();
			observer = undefined;
			watched = undefined;
			if (settleFrame !== undefined) view?.cancelAnimationFrame(settleFrame);
			for (const type of TRANSITION_EVENTS) {
				panelsEl.removeEventListener(type, onTransition as EventListener);
			}
			panelsEl.style.removeProperty("height");
			panelsEl.style.removeProperty("min-height");
			panelsEl.classList.remove("tabsdown__panels--animating");
		},
	};
}
