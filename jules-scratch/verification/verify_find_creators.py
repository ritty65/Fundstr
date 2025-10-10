from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Listen for console events and print them
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text()}"))

    # Navigate to the Find Creators page
    page.goto("http://localhost:9000/#/find-creators")

    # Wait for the first creator card to be visible
    try:
        expect(page.locator('.creator-card').first).to_be_visible(timeout=60000)
    except Exception as e:
        print(f"Error waiting for creator card: {e}")
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")
        raise

    # Take a screenshot to verify the UI changes
    page.screenshot(path="jules-scratch/verification/find-creators-page.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)