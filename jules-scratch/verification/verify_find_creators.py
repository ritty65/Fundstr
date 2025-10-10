import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # Go to the find creators page
            await page.goto("http://localhost:9000/#/find-creators", timeout=60000)

            # Wait for the main heading to ensure the page is loaded
            heading = page.locator('h1:has-text("Discover Creators on Nostr")')
            await expect(heading).to_be_visible(timeout=30000)
            print("Page heading is visible.")

            # Give the page a moment to start fetching data
            await page.wait_for_timeout(5000)

            # Take a screenshot of the initial state
            await page.screenshot(path="jules-scratch/verification/initial_page_state.png")
            print("Screenshot of initial state taken.")

            # Now, try to wait for the featured creators section specifically
            featured_creators_panel = page.locator('.q-card.find-creators-panel').nth(1)
            await expect(featured_creators_panel).to_be_visible(timeout=30000)
            print("Featured creators panel is visible.")

            # Wait for at least one creator card to be rendered
            first_creator_card = featured_creators_panel.locator('.creator-card').first
            await expect(first_creator_card).to_be_visible(timeout=30000)
            print("First creator card is visible.")

            # Take a screenshot of the final state
            await page.screenshot(path="jules-scratch/verification/final_page_state.png")
            print("Final screenshot taken.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error_screenshot.png")
            print("Error screenshot taken.")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())