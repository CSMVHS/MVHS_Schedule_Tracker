from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We can use timezone_id to avoid TZ issues
        context = browser.new_context(timezone_id="America/Denver")
        page = context.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        mock_date = "2026-02-06T11:20:00"

        # Inject mock Date BEFORE navigation
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

        # Wait for JS to run
        page.wait_for_timeout(2000)

        screenshot_path = "/home/jules/verification/verify_fonts_fixed.png"
        os.makedirs("/home/jules/verification", exist_ok=True)
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
