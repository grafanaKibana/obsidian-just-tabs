export interface HeightAnimator {
	animate(from: number): void;
	cancel(): void;
	settle(): void;
}

export function createHeightAnimator(panelsEl: HTMLElement): HeightAnimator {
	let animationFrame: number | undefined;
	let resetTimer: number | undefined;
	let ownerWindow: Window | undefined;

	const cancel = (): void => {
		if (animationFrame !== undefined) {
			ownerWindow?.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}
		if (resetTimer !== undefined) {
			ownerWindow?.clearTimeout(resetTimer);
			resetTimer = undefined;
		}
		ownerWindow = undefined;
	};

	const settle = (): void => {
		cancel();
		panelsEl.style.removeProperty("height");
		panelsEl.classList.remove("tabsdown__panels--animating");
	};

	return {
		cancel,
		settle,
		animate(from: number): void {
			cancel();
			ownerWindow = panelsEl.ownerDocument.defaultView ?? window;
			panelsEl.style.removeProperty("height");
			const to = panelsEl.getBoundingClientRect().height;
			panelsEl.style.height = `${from}px`;
			panelsEl.classList.add("tabsdown__panels--animating");
			animationFrame = ownerWindow.requestAnimationFrame(() => {
				panelsEl.style.height = `${to}px`;
				animationFrame = undefined;
			});

			// A custom property keeps whatever unit it was authored with, so a theme
			// writing 0.5s has to be read as 500ms and not as half a millisecond.
			const authored = ownerWindow
				.getComputedStyle(panelsEl)
				.getPropertyValue("--tabsdown-animation-duration")
				.trim();
			const value = Number.parseFloat(authored);
			const duration =
				authored.endsWith("s") && !authored.endsWith("ms")
					? value * 1000
					: value;
			resetTimer = ownerWindow.setTimeout(
				settle,
				Number.isFinite(duration) ? duration + 50 : 250,
			);
		},
	};
}
