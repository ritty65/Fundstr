from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen for console events and print them
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        # Navigate to the find-creators page
        page.goto("http://localhost:9000/#/find-creators", wait_until='networkidle')

        # Wait for the featured creators to load
        # We can identify the container for featured creators and wait for it to have children
        featured_creators_container = page.locator('.find-creators-panel .fixed-grid').nth(1)

        # Wait for at least one creator card to be visible
        expect(featured_creators_container.locator('.creator-card').first).to_be_visible(timeout=30000)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()