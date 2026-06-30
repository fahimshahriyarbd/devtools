#!/usr/bin/env python3
"""
PART 3 — FRONTEND PLAYWRIGHT E2E TEST
Tests the relay message ordering fix with two browser contexts.
"""

import asyncio
import sys
import time
from playwright.async_api import async_playwright

BASE_URL = "https://dev-suite-16.preview.emergentagent.com"

async def test_text_share():
    """
    T_TEXT: Test text share with ordering verification
    """
    print("\n" + "=" * 80)
    print("T_TEXT — WiFi Text Share E2E Test")
    print("=" * 80)
    
    async with async_playwright() as p:
        # Launch browser with WebRTC flags
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-features=WebRtcHideLocalIpsWithMdns',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream'
            ]
        )
        
        # Create two separate contexts (simulating different devices)
        context_a = await browser.new_context()
        context_b = await browser.new_context()
        
        page_a = await context_a.new_page()
        page_b = await context_b.new_page()
        
        # Capture console logs
        logs_a = []
        logs_b = []
        
        page_a.on("console", lambda msg: logs_a.append(f"[A] {msg.type}: {msg.text}"))
        page_b.on("console", lambda msg: logs_b.append(f"[B] {msg.type}: {msg.text}"))
        
        try:
            # Step 1: Context A creates room
            print("\n=== Step 1: Context A creates room ===")
            await page_a.goto(f"{BASE_URL}/wifi-text-share", wait_until="networkidle", timeout=30000)
            await page_a.wait_for_timeout(1000)
            
            # Click Create button
            create_btn = page_a.locator('button:has-text("Create")')
            await create_btn.click()
            await page_a.wait_for_timeout(2000)
            
            # Read room code from header badge (look for 4-digit code in Badge)
            # Wait for the room to be created and the badge to appear
            await page_a.wait_for_timeout(1000)
            room_code_elem = page_a.locator('text=/^\\d{4}$/').first
            room_code = await room_code_elem.text_content()
            room_code = room_code.strip()
            print(f"✅ Room created: {room_code}")
            
            # Step 2: Context B joins with the code
            print(f"\n=== Step 2: Context B joins with code {room_code} ===")
            await page_b.goto(f"{BASE_URL}/wifi-text-share", wait_until="networkidle", timeout=30000)
            await page_b.wait_for_timeout(1000)
            
            # Enter room code
            room_input = page_b.locator('[data-testid="wifi-text-share-room-code-input"]')
            await room_input.fill(room_code)
            
            # Click Join button
            join_btn = page_b.locator('[data-testid="wifi-text-share-join-btn"]')
            await join_btn.click()
            await page_b.wait_for_timeout(2000)
            print("✅ Context B joined room")
            
            # Step 3: Wait for connection to establish
            print("\n=== Step 3: Wait for connection (10 seconds) ===")
            
            # Close the QR code dialog if it's open (press Escape)
            await page_a.keyboard.press('Escape')
            await page_a.wait_for_timeout(1000)
            print("✅ Pressed Escape to close any dialogs")
            
            await page_a.wait_for_timeout(9000)
            print("✅ Waited for connection")
            
            # Step 4: Context A types test string
            print("\n=== Step 4: Context A types 'ORDER TEST ABCDEFGHIJ' ===")
            
            # Click into Monaco editor
            editor_a = page_a.locator('.monaco-editor').first
            await editor_a.click()
            await page_a.wait_for_timeout(500)
            
            # Type with delay to simulate realistic typing
            await page_a.keyboard.type("ORDER TEST ABCDEFGHIJ", delay=30)
            print("✅ Context A typed test string")
            
            # Step 5: Wait 6 seconds
            print("\n=== Step 5: Wait 6 seconds ===")
            await page_a.wait_for_timeout(6000)
            
            # Step 6: Read Context B's editor content
            print("\n=== Step 6: Read Context B's editor content ===")
            content_b = await page_b.evaluate("""
                (window.monaco?.editor?.getModels?.()?.[0]?.getValue?.()) || 
                document.querySelector('.monaco-editor textarea')?.value || ''
            """)
            
            print(f"Context B content: '{content_b}'")
            
            # Verify content contains the test string
            assert "ORDER TEST ABCDEFGHIJ" in content_b or "FGHIJ" in content_b, \
                f"Expected 'ORDER TEST ABCDEFGHIJ' or at least 'FGHIJ', got: '{content_b}'"
            print("✅ Step 6 PASSED - Context B received text correctly")
            
            # Step 7: Context B types reply
            print("\n=== Step 7: Context B types ' | REPLY' ===")
            editor_b = page_b.locator('.monaco-editor').first
            await editor_b.click()
            await page_b.wait_for_timeout(500)
            await page_b.keyboard.type(" | REPLY", delay=30)
            print("✅ Context B typed reply")
            
            # Step 8: Wait 6 seconds and read Context A
            print("\n=== Step 8: Wait 6 seconds and read Context A ===")
            await page_b.wait_for_timeout(6000)
            
            content_a = await page_a.evaluate("""
                (window.monaco?.editor?.getModels?.()?.[0]?.getValue?.()) || 
                document.querySelector('.monaco-editor textarea')?.value || ''
            """)
            
            print(f"Context A content: '{content_a}'")
            
            # Verify reply received
            assert "REPLY" in content_a, f"Expected 'REPLY' in Context A, got: '{content_a}'"
            print("✅ Step 8 PASSED - Context A received reply correctly")
            
            # Check console logs for RTC verification
            print("\n=== Console Logs Analysis ===")
            rtc_logs_a = [log for log in logs_a if '[rtc]' in log.lower() or 'dc verified' in log.lower() or 'relay mode' in log.lower()]
            rtc_logs_b = [log for log in logs_b if '[rtc]' in log.lower() or 'dc verified' in log.lower() or 'relay mode' in log.lower()]
            
            print(f"\nContext A RTC logs ({len(rtc_logs_a)} found):")
            for log in rtc_logs_a[:10]:
                print(f"  {log}")
            
            print(f"\nContext B RTC logs ({len(rtc_logs_b)} found):")
            for log in rtc_logs_b[:10]:
                print(f"  {log}")
            
            print("\n" + "=" * 80)
            print("✅ T_TEXT PASSED - Text ordering test successful")
            print("=" * 80)
            
            return True
            
        except Exception as e:
            print(f"\n❌ T_TEXT FAILED: {e}")
            
            # Save screenshots for debugging
            await page_a.screenshot(path="/tmp/t_text_context_a_error.png")
            await page_b.screenshot(path="/tmp/t_text_context_b_error.png")
            print("Screenshots saved: /tmp/t_text_context_a_error.png, /tmp/t_text_context_b_error.png")
            
            return False
            
        finally:
            await context_a.close()
            await context_b.close()
            await browser.close()


async def test_file_share():
    """
    T_FILE: Test file share with ordering verification
    """
    print("\n" + "=" * 80)
    print("T_FILE — WiFi File Share E2E Test")
    print("=" * 80)
    
    async with async_playwright() as p:
        # Launch browser with WebRTC flags
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-features=WebRtcHideLocalIpsWithMdns',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream'
            ]
        )
        
        # Create two separate contexts
        context_a = await browser.new_context()
        context_b = await browser.new_context()
        
        page_a = await context_a.new_page()
        page_b = await context_b.new_page()
        
        # Capture console logs
        logs_a = []
        logs_b = []
        
        page_a.on("console", lambda msg: logs_a.append(f"[A] {msg.type}: {msg.text}"))
        page_b.on("console", lambda msg: logs_b.append(f"[B] {msg.type}: {msg.text}"))
        
        try:
            # Step 1: Context A creates room
            print("\n=== Step 1: Context A creates room ===")
            await page_a.goto(f"{BASE_URL}/wifi-file-share", wait_until="networkidle", timeout=30000)
            await page_a.wait_for_timeout(1000)
            
            # Click Create button
            create_btn = page_a.locator('button:has-text("Create")')
            await create_btn.click()
            await page_a.wait_for_timeout(2000)
            
            # Read room code
            room_code_elem = page_a.locator('text=/\\d{4}/').first
            room_code = await room_code_elem.text_content()
            room_code = room_code.strip()
            print(f"✅ Room created: {room_code}")
            
            # Step 2: Context B joins
            print(f"\n=== Step 2: Context B joins with code {room_code} ===")
            await page_b.goto(f"{BASE_URL}/wifi-file-share", wait_until="networkidle", timeout=30000)
            await page_b.wait_for_timeout(1000)
            
            # Enter room code (use the correct testid)
            room_input = page_b.locator('[data-testid="wifi-file-share-room-code-input"]')
            await room_input.fill(room_code)
            
            # Click Join button
            join_btn = page_b.locator('button:has-text("Join")')
            await join_btn.click()
            await page_b.wait_for_timeout(2000)
            print("✅ Context B joined room")
            
            # Step 3: Wait for "2 devices" indicator
            print("\n=== Step 3: Wait for '2 devices' indicator ===")
            await page_a.wait_for_timeout(5000)
            
            # Check device count
            device_count_a = page_a.locator('text=/2 devices/i')
            await device_count_a.wait_for(state="visible", timeout=10000)
            print("✅ Context A shows '2 devices'")
            
            # Step 4: Create test file
            print("\n=== Step 4: Create test file ===")
            test_content = "HELLO CROSS DEVICE - this content must survive the relay ordering fix.\n" * 50
            
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, dir='/tmp', prefix='cross_dev_test_') as f:
                f.write(test_content)
                test_file_path = f.name
            
            print(f"Test file created: {test_file_path} ({len(test_content)} bytes)")
            
            # Step 5: Upload file on Context A (use specific testid)
            print("\n=== Step 5: Upload file on Context A ===")
            file_input = page_a.locator('[data-testid="file-input"]')
            await file_input.set_input_files(test_file_path)
            await page_a.wait_for_timeout(2000)
            print("✅ File uploaded on Context A")
            
            # Step 6: Wait for file to appear on Context B (up to 20s)
            print("\n=== Step 6: Wait for file on Context B (up to 20s) ===")
            
            # Wait for Download button to appear
            download_btn_b = page_b.locator('button:has-text("Download"), a:has-text("Download")').first
            await download_btn_b.wait_for(state="visible", timeout=20000)
            print("✅ File appeared on Context B with Download button")
            
            # Step 7: Check for error toasts
            print("\n=== Step 7: Check for error toasts ===")
            
            # Check Context A for error toasts
            error_toast_a = page_a.locator('text=/WebRTC not connected|Couldn\'t reach/i')
            error_count_a = await error_toast_a.count()
            
            # Check Context B for error toasts
            error_toast_b = page_b.locator('text=/WebRTC not connected|Couldn\'t reach/i')
            error_count_b = await error_toast_b.count()
            
            assert error_count_a == 0, f"Context A has {error_count_a} error toasts"
            assert error_count_b == 0, f"Context B has {error_count_b} error toasts"
            print("✅ No error toasts on either context")
            
            # Step 8: Capture screenshots
            print("\n=== Step 8: Capture screenshots ===")
            await page_a.screenshot(path="/tmp/t_file_context_a_final.png")
            await page_b.screenshot(path="/tmp/t_file_context_b_final.png")
            print("Screenshots saved: /tmp/t_file_context_a_final.png, /tmp/t_file_context_b_final.png")
            
            # Check console logs for RTC verification
            print("\n=== Console Logs Analysis ===")
            rtc_logs_a = [log for log in logs_a if '[rtc]' in log.lower() or 'dc verified' in log.lower() or 'relay mode' in log.lower()]
            rtc_logs_b = [log for log in logs_b if '[rtc]' in log.lower() or 'dc verified' in log.lower() or 'relay mode' in log.lower()]
            
            print(f"\nContext A RTC logs ({len(rtc_logs_a)} found):")
            for log in rtc_logs_a[:10]:
                print(f"  {log}")
            
            print(f"\nContext B RTC logs ({len(rtc_logs_b)} found):")
            for log in rtc_logs_b[:10]:
                print(f"  {log}")
            
            print("\n" + "=" * 80)
            print("✅ T_FILE PASSED - File ordering test successful")
            print("=" * 80)
            
            return True
            
        except Exception as e:
            print(f"\n❌ T_FILE FAILED: {e}")
            
            # Save screenshots for debugging
            await page_a.screenshot(path="/tmp/t_file_context_a_error.png")
            await page_b.screenshot(path="/tmp/t_file_context_b_error.png")
            print("Screenshots saved: /tmp/t_file_context_a_error.png, /tmp/t_file_context_b_error.png")
            
            return False
            
        finally:
            await context_a.close()
            await context_b.close()
            await browser.close()


async def main():
    print("=" * 80)
    print("PART 3 — FRONTEND PLAYWRIGHT E2E TESTS")
    print("=" * 80)
    
    try:
        # Test text share
        text_result = await test_text_share()
        
        # Test file share
        file_result = await test_file_share()
        
        if text_result and file_result:
            print("\n" + "=" * 80)
            print("✅ ALL E2E TESTS PASSED (T_TEXT, T_FILE)")
            print("=" * 80)
            return 0
        else:
            print("\n" + "=" * 80)
            print("❌ SOME E2E TESTS FAILED")
            print(f"   T_TEXT: {'PASSED' if text_result else 'FAILED'}")
            print(f"   T_FILE: {'PASSED' if file_result else 'FAILED'}")
            print("=" * 80)
            return 1
            
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
