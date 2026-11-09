describe("app startup", () => {
  it("shows the welcome screen with an Open Folder action", async () => {
    await expect($("button*=Open Folder")).toBeDisplayed();
  });

  it("loads the WebdriverIO bridge only in the e2e build", async () => {
    const available = await browser.execute(() => "wdioTauri" in window);
    expect(available).toBe(true);
  });
});
