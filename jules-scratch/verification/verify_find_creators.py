from playwright.sync_api import sync_playwright, expect
import time

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Navigate to the root and complete the welcome wizard
            page.goto("http://localhost:9000/", timeout=90000)
            page.wait_for_load_state('networkidle', timeout=60000)

            accept_button = page.get_by_role("button", name="Accept")
            if accept_button.is_visible(timeout=5000):
                accept_button.click()

            for i in range(6):
                time.sleep(0.5)
                checkbox_locator = page.locator('.q-checkbox')
                if checkbox_locator.count() > 0 and checkbox_locator.is_visible():
                    checkbox_locator.click()

                next_button = page.get_by_role("button", name="Next")
                expect(next_button).to_be_enabled(timeout=15000)
                next_button.click()

            finish_button = page.get_by_role("button", name="FINISH")
            expect(finish_button).to_be_enabled(timeout=15000)
            finish_button.click()

            # 2. Open navigation and go to Find Creators
            expect(page.get_by_role("heading", name="About Fundstr")).to_be_visible(timeout=30000)

            menu_button = page.locator('button[aria-label="Menu"]')
            expect(menu_button).to_be_visible(timeout=30000)
            menu_button.click()

            nav_drawer = page.locator('.q-drawer')
            expect(nav_drawer).to_be_visible(timeout=15000)

            find_creators_link = page.get_by_role("link", name="Find Creators")
            expect(find_creators_link).to_be_visible(timeout=15000)
            find_creators_link.click()

            # 3. Verify the Find Creators page
            expect(page.get_by_role("heading", name="Discover Creators on Nostr")).to_be_visible(timeout=30000)

            featured_creators_heading = page.get_by_role("heading", name="Featured Creators")
            expect(featured_creators_heading).to_be_visible(timeout=30000)
            featured_grid = featured_creators_heading.locator('xpath=./following-sibling::div[1]')
            expect(featured_grid.locator('.q-card').first).to_be_visible(timeout=30000)

            search_input = page.get_by_label("Search Nostr profiles")
            search_input.fill("alden")
            page.get_by_label("Search").click()

            alden_card = page.locator('.q-card:has-text("Lyn Alden")')
            expect(alden_card).to_be_visible(timeout=30000)

            subscribe_button = alden_card.get_by_role("button", name="Subscribe")
            subscribe_button.click()

            modal_heading = page.get_by_role("heading", name="Subscription tiers")
            expect(modal_heading).to_be_visible(timeout=30000)

            tiers_grid = modal_heading.locator('xpath=./following-sibling::div[1]')
            expect(tiers_grid.locator('.tier-card').first).to_be_visible(timeout=30000)

            # 4. Take final screenshot
            page.screenshot(path="jules-scratch/verification/find_creators_verification.png", full_page=True)
            print("Verification script completed successfully.")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            page.screenshot(path="jules-scratch/verification/find_creators_error.png", full_page=True)

        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()