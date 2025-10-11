from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:9000/#/find-creators")

        # Wait for the initial creators to load
        #expect(page.locator(".creator-card")).to_have_count(1, timeout=10000)
        page.wait_for_selector(".creator-card", timeout=10000)

        # Take a screenshot of the initial page
        page.screenshot(path="jules-scratch/verification/01-initial-load.png")

        # Find a creator card and click to open the modal
        first_card = page.locator(".creator-card").first
        first_card.click()

        # Wait for the modal to appear
        modal = page.locator(".profile-card")
        expect(modal).to_be_visible(timeout=10000)

        # Take a screenshot of the modal
        page.screenshot(path="jules-scratch/verification/02-modal-open.png")

        browser.close()

run()