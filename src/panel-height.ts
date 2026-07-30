export interface HeightAnimator {
	animate(from: number): void;
	cancel(): void;
	settle(): void;
}

export function createHeightAnimator(panelsEl: HTMLElement): HeightAnimator {
	let animationFrame: number | undefined;
	let resetTimer: number | undefined;

	const cancel = (): void => {
		if (animationFrame !== undefined) {
			window.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}
		if (resetTimer !== undefined) {
			window.clearTimeout(resetTimer);
			resetTimer = undefined;
		}
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
			panelsEl.style.removeProperty("height");
			const to = panelsEl.getBoundingClientRect().height;
			panelsEl.style.height = `${from}px`;
			panelsEl.classList.add("tabsdown__panels--animating");
			animationFrame = window.requestAnimationFrame(() => {
				panelsEl.style.height = `${to}px`;
				animationFrame = undefined;
			});

			const duration = Number.parseFloat(
				getComputedStyle(panelsEl).getPropertyValue(
					"--tabsdown-animation-duration",
				),
			);
			resetTimer = window.setTimeout(
				settle,
				Number.isFinite(duration) ? duration + 50 : 250,
			);
		},
	};
}
