from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(timezone_id="America/Denver")
        page = context.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        # Friday schedule: Period 4 is 10:33 to 11:24
        # Mocking 11:00:00 - should show some progress
        mock_date = "2026-02-06T11:00:00"

        page.add_init_script(f"""
            const mockDateStr = '{mock_date}';
            const RealDate = Date;
            window.Date = class extends RealDate {{
                constructor(...args) {{
                    if (args.length === 0) return new RealDate(mockDateStr);
                    return new RealDate(...args);
                }}
                static now() {{
                    return new RealDate(mockDateStr).getTime();
                }}
            }};
        """)

        file_path = "file://" + os.path.abspath("index.html")
        page.goto(file_path)
        page.wait_for_timeout(2000)

        screenshot_path = "/home/jules/verification/final_screenshot.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
