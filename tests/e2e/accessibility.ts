import { expect, type Locator, type Page } from "@playwright/test";

const interactive = "button,a[href],input,select,textarea,[tabindex]:not([tabindex='-1'])";

async function controlsInTabOrder(page: Page): Promise<Locator[]> {
  const candidates = await page.locator(interactive).all();
  const controls: Locator[] = [];
  for (const candidate of candidates) {
    if (!await candidate.isVisible() || !await candidate.isEnabled()) continue;
    if (await candidate.getAttribute("disabled") !== null || await candidate.getAttribute("aria-disabled") === "true") continue;
    const tabIndex = await candidate.evaluate(element => (element as HTMLElement).tabIndex);
    if (tabIndex < 0) continue;
    controls.push(candidate);
  }
  return controls;
}

async function resetFocus(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
}

export async function assertKeyboardAccessible(page: Page) {
  const controls = await controlsInTabOrder(page);
  for (const control of controls) expect(await control.ariaSnapshot(), "interactive element must expose a computed accessible name").toMatch(/\S/);
  if (!controls.length) return;
  await resetFocus(page);
  for (const control of controls) {
    let reached = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.keyboard.press("Tab");
      if (await control.evaluate(element => element === document.activeElement)) { reached = true; break; }
    }
    expect(reached, "Tab order skipped or trapped before this control").toBe(true);
  }
  const reverse = [...controls].reverse();
  await reverse[0]!.focus();
  await expect(reverse[0]!).toBeFocused();
  for (const control of reverse.slice(1)) {
    let reached = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.keyboard.press("Shift+Tab");
      if (await control.evaluate(element => element === document.activeElement)) { reached = true; break; }
    }
    expect(reached, "reverse Tab order skipped or trapped before this control").toBe(true);
  }
}
