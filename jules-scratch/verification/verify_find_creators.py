from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the Find Creators page
        page.goto("http://localhost:9000/#/find-creators")

        # Wait for the page to be fully loaded
        page.wait_for_load_state("networkidle")

        # Wait for the initial search to complete, with a longer timeout
        expect(page.locator('.q-skeleton').first).not_to_be_visible(timeout=30000)

        # Take a screenshot of the initial state
        page.screenshot(path="jules-scratch/verification/01-initial-load.png")

        # Enter a search query
        search_input = page.get_by_label("Search Nostr profiles")
        search_input.fill("dergigi")

        # Wait for the search results to appear
        expect(page.locator('text=dergigi')).to_be_visible(timeout=10000)

        # Take a screenshot of the search results
        page.screenshot(path="jules-scratch/verification/02-search-results.png")

        browser.close()

if __name__ == "__main__":
    run_verification()