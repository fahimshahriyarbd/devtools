#!/usr/bin/env python3
"""
Backend API tests for WiFi Files / WiFi Text Share signaling fixes.
Tests B1-B10 as specified in the review request.
"""
import base64
import json
import os
import sys
import time

import requests

# Backend URL from frontend/.env
BACKEND_URL = "https://dev-suite-16.preview.emergentagent.com"
BASE_URL = f"{BACKEND_URL}/api/signal"

# Test results tracking
test_results = []


def log_test(test_id: str, passed: bool, message: str, details: dict = None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} - {test_id}: {message}")
    if details:
        print(f"  Details: {json.dumps(details, indent=2)}")
    test_results.append({
        "test_id": test_id,
        "passed": passed,
        "message": message,
        "details": details or {}
    })


def test_b1_create_room():
    """B1. POST /api/signal/create - Create a file share room"""
    print("\n" + "="*80)
    print("TEST B1: POST /api/signal/create")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/create",
            json={"hostId": "host-a", "hostName": "Alice", "kind": "file"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B1", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return None
        
        data = response.json()
        
        # Verify response structure
        if "room" not in data or "youAre" not in data:
            log_test("B1", False, "Missing 'room' or 'youAre' in response", 
                    {"response": data})
            return None
        
        room = data["room"]
        
        # Verify room has id and devices
        if "id" not in room or "devices" not in room:
            log_test("B1", False, "Missing 'id' or 'devices' in room", 
                    {"room": room})
            return None
        
        # Verify devices array contains host
        devices = room["devices"]
        if not isinstance(devices, list) or len(devices) != 1:
            log_test("B1", False, f"Expected 1 device, got {len(devices)}", 
                    {"devices": devices})
            return None
        
        host_device = devices[0]
        if host_device.get("id") != "host-a" or host_device.get("name") != "Alice":
            log_test("B1", False, "Host device has incorrect id or name", 
                    {"device": host_device})
            return None
        
        if data["youAre"] != "host-a":
            log_test("B1", False, f"Expected youAre='host-a', got '{data['youAre']}'", 
                    {"response": data})
            return None
        
        room_id = room["id"]
        log_test("B1", True, f"Room created successfully with ID: {room_id}", 
                {"room_id": room_id, "devices": devices})
        return room_id
        
    except Exception as e:
        log_test("B1", False, f"Exception: {str(e)}", {"error": str(e)})
        return None


def test_b2_check_name_taken(room_id: str):
    """B2. POST /api/signal/check-name - Check if 'Alice' is taken"""
    print("\n" + "="*80)
    print("TEST B2: POST /api/signal/check-name (name='Alice', should be taken)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/check-name",
            json={"roomId": room_id, "name": "Alice"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B2", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        
        # Verify response structure
        if "taken" not in data or "suggested" not in data or "exists" not in data:
            log_test("B2", False, "Missing required fields in response", 
                    {"response": data})
            return False
        
        # Verify values
        if data["taken"] != True:
            log_test("B2", False, f"Expected taken=true, got {data['taken']}", 
                    {"response": data})
            return False
        
        if data["suggested"] != "Alice (2)":
            log_test("B2", False, f"Expected suggested='Alice (2)', got '{data['suggested']}'", 
                    {"response": data})
            return False
        
        if data["exists"] != True:
            log_test("B2", False, f"Expected exists=true, got {data['exists']}", 
                    {"response": data})
            return False
        
        log_test("B2", True, "Name check correctly identified 'Alice' as taken", 
                {"response": data})
        return True
        
    except Exception as e:
        log_test("B2", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b3_check_name_available(room_id: str):
    """B3. POST /api/signal/check-name - Check if 'Charlie' is available"""
    print("\n" + "="*80)
    print("TEST B3: POST /api/signal/check-name (name='Charlie', should be available)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/check-name",
            json={"roomId": room_id, "name": "Charlie"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B3", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        
        # Verify values
        if data.get("taken") != False:
            log_test("B3", False, f"Expected taken=false, got {data.get('taken')}", 
                    {"response": data})
            return False
        
        if data.get("suggested") != "Charlie":
            log_test("B3", False, f"Expected suggested='Charlie', got '{data.get('suggested')}'", 
                    {"response": data})
            return False
        
        if data.get("exists") != True:
            log_test("B3", False, f"Expected exists=true, got {data.get('exists')}", 
                    {"response": data})
            return False
        
        log_test("B3", True, "Name check correctly identified 'Charlie' as available", 
                {"response": data})
        return True
        
    except Exception as e:
        log_test("B3", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b4_check_name_nonexistent_room():
    """B4. POST /api/signal/check-name - Check name in non-existent room"""
    print("\n" + "="*80)
    print("TEST B4: POST /api/signal/check-name (roomId='0000', non-existent)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/check-name",
            json={"roomId": "0000", "name": "X"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B4", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        
        # Verify values
        if data.get("taken") != False:
            log_test("B4", False, f"Expected taken=false, got {data.get('taken')}", 
                    {"response": data})
            return False
        
        if data.get("suggested") != "X":
            log_test("B4", False, f"Expected suggested='X', got '{data.get('suggested')}'", 
                    {"response": data})
            return False
        
        if data.get("exists") != False:
            log_test("B4", False, f"Expected exists=false, got {data.get('exists')}", 
                    {"response": data})
            return False
        
        log_test("B4", True, "Name check correctly handled non-existent room (no error)", 
                {"response": data})
        return True
        
    except Exception as e:
        log_test("B4", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b5_join_duplicate_name(room_id: str):
    """B5. POST /api/signal/join - Guest joins with same name 'Alice'"""
    print("\n" + "="*80)
    print("TEST B5: POST /api/signal/join (guest-1 joins as 'Alice', should be auto-deduped)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/join",
            json={
                "roomId": room_id,
                "deviceId": "guest-1",
                "name": "Alice",
                "expectKind": "file"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B5", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        
        if "room" not in data:
            log_test("B5", False, "Missing 'room' in response", {"response": data})
            return False
        
        room = data["room"]
        devices = room.get("devices", [])
        
        # CRITICAL: Must have exactly 2 devices
        if len(devices) != 2:
            log_test("B5", False, f"Expected 2 devices, got {len(devices)}", 
                    {"devices": devices})
            return False
        
        # Find the two devices
        host_device = None
        guest_device = None
        
        for device in devices:
            if device.get("id") == "host-a":
                host_device = device
            elif device.get("id") == "guest-1":
                guest_device = device
        
        if not host_device or not guest_device:
            log_test("B5", False, "Could not find both host-a and guest-1 in devices", 
                    {"devices": devices})
            return False
        
        # CRITICAL: Host must be named exactly "Alice"
        if host_device.get("name") != "Alice":
            log_test("B5", False, f"Host name should be 'Alice', got '{host_device.get('name')}'", 
                    {"host_device": host_device})
            return False
        
        # CRITICAL: Guest must be named exactly "Alice (2)" (auto-deduped)
        if guest_device.get("name") != "Alice (2)":
            log_test("B5", False, 
                    f"Guest name should be 'Alice (2)' (auto-deduped), got '{guest_device.get('name')}'", 
                    {"guest_device": guest_device})
            return False
        
        log_test("B5", True, 
                "Guest joined successfully with auto-deduped name 'Alice (2)'", 
                {"host": host_device, "guest": guest_device})
        return True
        
    except Exception as e:
        log_test("B5", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b6_join_third_duplicate(room_id: str):
    """B6. POST /api/signal/join - Third device joins also wanting 'Alice'"""
    print("\n" + "="*80)
    print("TEST B6: POST /api/signal/join (guest-2 joins as 'Alice', should become 'Alice (3)')")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/join",
            json={
                "roomId": room_id,
                "deviceId": "guest-2",
                "name": "Alice",
                "expectKind": "file"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B6", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        room = data.get("room", {})
        devices = room.get("devices", [])
        
        # Must have exactly 3 devices now
        if len(devices) != 3:
            log_test("B6", False, f"Expected 3 devices, got {len(devices)}", 
                    {"devices": devices})
            return False
        
        # Find guest-2
        guest2_device = None
        for device in devices:
            if device.get("id") == "guest-2":
                guest2_device = device
                break
        
        if not guest2_device:
            log_test("B6", False, "Could not find guest-2 in devices", 
                    {"devices": devices})
            return False
        
        # CRITICAL: guest-2 must be named "Alice (3)"
        if guest2_device.get("name") != "Alice (3)":
            log_test("B6", False, 
                    f"Guest-2 name should be 'Alice (3)', got '{guest2_device.get('name')}'", 
                    {"guest2_device": guest2_device})
            return False
        
        log_test("B6", True, 
                "Third device joined successfully with auto-deduped name 'Alice (3)'", 
                {"guest2": guest2_device, "all_devices": devices})
        return True
        
    except Exception as e:
        log_test("B6", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b7_join_lowercase_duplicate(room_id: str):
    """B7. POST /api/signal/join - Fourth device joins as 'alice' (lowercase)"""
    print("\n" + "="*80)
    print("TEST B7: POST /api/signal/join (guest-3 joins as 'alice' lowercase, should be deduped)")
    print("="*80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/join",
            json={
                "roomId": room_id,
                "deviceId": "guest-3",
                "name": "alice",
                "expectKind": "file"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B7", False, f"Expected 200, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        room = data.get("room", {})
        devices = room.get("devices", [])
        
        # Must have exactly 4 devices now
        if len(devices) != 4:
            log_test("B7", False, f"Expected 4 devices, got {len(devices)}", 
                    {"devices": devices})
            return False
        
        # Find guest-3
        guest3_device = None
        for device in devices:
            if device.get("id") == "guest-3":
                guest3_device = device
                break
        
        if not guest3_device:
            log_test("B7", False, "Could not find guest-3 in devices", 
                    {"devices": devices})
            return False
        
        guest3_name = guest3_device.get("name", "")
        
        # CRITICAL: guest-3 must NOT be plain "alice" or "Alice"
        # Should be something like "alice (2)" or similar
        if guest3_name.lower() in ["alice", "alice (2)", "alice (3)"]:
            # These are already taken, so it should be different
            # Actually, case-insensitive dedupe means "alice" conflicts with "Alice", "Alice (2)", "Alice (3)"
            # So it should become "alice (4)" or similar
            pass
        
        # The name should be deduped (not plain "alice")
        if guest3_name.lower() == "alice":
            log_test("B7", False, 
                    f"Guest-3 name should be deduped (not plain 'alice'), got '{guest3_name}'", 
                    {"guest3_device": guest3_device})
            return False
        
        log_test("B7", True, 
                f"Fourth device joined with case-insensitive deduped name '{guest3_name}'", 
                {"guest3": guest3_device, "all_devices": devices})
        return True
        
    except Exception as e:
        log_test("B7", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b8_relay_large_binary(room_id: str):
    """B8. POST /api/signal/relay - Large binary payload (~25KB base64)"""
    print("\n" + "="*80)
    print("TEST B8: POST /api/signal/relay (large binary payload ~25KB)")
    print("="*80)
    
    try:
        # Generate ~18KB of random bytes, which becomes ~25KB when base64-encoded
        random_bytes = os.urandom(18 * 1024)
        base64_data = base64.b64encode(random_bytes).decode('ascii')
        
        print(f"  Generated {len(random_bytes)} bytes → {len(base64_data)} base64 chars")
        
        # Send relay message from host-a to guest-1
        response = requests.post(
            f"{BASE_URL}/relay",
            json={
                "roomId": room_id,
                "fromId": "host-a",
                "toId": "guest-1",
                "data": base64_data,
                "binary": True
            },
            timeout=15
        )
        
        if response.status_code != 200:
            log_test("B8", False, f"Relay POST failed with {response.status_code}", 
                    {"response": response.text})
            return False
        
        # Wait a moment for message to be queued
        time.sleep(0.5)
        
        # Poll for guest-1 to receive the message
        poll_response = requests.get(
            f"{BASE_URL}/poll",
            params={"roomId": room_id, "deviceId": "guest-1"},
            timeout=10
        )
        
        if poll_response.status_code != 200:
            log_test("B8", False, f"Poll failed with {poll_response.status_code}", 
                    {"response": poll_response.text})
            return False
        
        poll_data = poll_response.json()
        messages = poll_data.get("messages", [])
        
        # Find the relay-data message
        relay_msg = None
        for msg in messages:
            if msg.get("type") == "relay-data" and msg.get("from") == "host-a":
                relay_msg = msg
                break
        
        if not relay_msg:
            log_test("B8", False, "No relay-data message found in poll response", 
                    {"messages": messages})
            return False
        
        # Verify the message structure
        if relay_msg.get("binary") != True:
            log_test("B8", False, f"Expected binary=true, got {relay_msg.get('binary')}", 
                    {"relay_msg": relay_msg})
            return False
        
        received_data = relay_msg.get("data", "")
        
        # CRITICAL: Verify the data round-trips exactly
        if received_data != base64_data:
            log_test("B8", False, 
                    f"Data mismatch: sent {len(base64_data)} chars, received {len(received_data)} chars", 
                    {"sent_length": len(base64_data), "received_length": len(received_data)})
            return False
        
        log_test("B8", True, 
                f"Large binary payload ({len(base64_data)} chars) round-tripped correctly", 
                {"payload_size": len(base64_data), "binary": True})
        return True
        
    except Exception as e:
        log_test("B8", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b9_relay_broadcast(room_id: str):
    """B9. POST /api/signal/relay - Broadcast (no toId)"""
    print("\n" + "="*80)
    print("TEST B9: POST /api/signal/relay (broadcast, no toId)")
    print("="*80)
    
    try:
        # Send broadcast from host-a (no toId)
        response = requests.post(
            f"{BASE_URL}/relay",
            json={
                "roomId": room_id,
                "fromId": "host-a",
                "data": "hello broadcast",
                "binary": False
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B9", False, f"Broadcast relay POST failed with {response.status_code}", 
                    {"response": response.text})
            return False
        
        # Wait a moment for messages to be queued
        time.sleep(0.5)
        
        # Poll for each guest (guest-1, guest-2, guest-3)
        guests = ["guest-1", "guest-2", "guest-3"]
        all_received = True
        results = {}
        
        for guest_id in guests:
            poll_response = requests.get(
                f"{BASE_URL}/poll",
                params={"roomId": room_id, "deviceId": guest_id},
                timeout=10
            )
            
            if poll_response.status_code != 200:
                results[guest_id] = f"Poll failed: {poll_response.status_code}"
                all_received = False
                continue
            
            poll_data = poll_response.json()
            messages = poll_data.get("messages", [])
            
            # Find the broadcast relay-data message
            broadcast_msg = None
            for msg in messages:
                if (msg.get("type") == "relay-data" and 
                    msg.get("from") == "host-a" and 
                    msg.get("data") == "hello broadcast"):
                    broadcast_msg = msg
                    break
            
            if broadcast_msg:
                results[guest_id] = "✅ Received broadcast"
            else:
                results[guest_id] = f"❌ No broadcast message (got {len(messages)} messages)"
                all_received = False
        
        if not all_received:
            log_test("B9", False, "Not all guests received the broadcast", 
                    {"results": results})
            return False
        
        log_test("B9", True, "All guests received the broadcast message", 
                {"results": results})
        return True
        
    except Exception as e:
        log_test("B9", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def test_b10_regression_smoke():
    """B10. Regression smoke test - Confirm existing endpoints still work"""
    print("\n" + "="*80)
    print("TEST B10: Regression smoke test")
    print("="*80)
    
    try:
        # Create a text room
        print("  Step 1: Create text room...")
        response = requests.post(
            f"{BASE_URL}/create",
            json={"hostId": "test-host", "hostName": "TestHost", "kind": "text"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B10", False, f"Create text room failed: {response.status_code}", 
                    {"response": response.text})
            return False
        
        data = response.json()
        text_room_id = data["room"]["id"]
        print(f"    ✓ Text room created: {text_room_id}")
        
        # Try to join with wrong expectKind (should fail with 409)
        print("  Step 2: Join with wrong expectKind (should fail with 409)...")
        response = requests.post(
            f"{BASE_URL}/join",
            json={
                "roomId": text_room_id,
                "deviceId": "test-guest",
                "name": "TestGuest",
                "expectKind": "file"
            },
            timeout=10
        )
        
        if response.status_code != 409:
            log_test("B10", False, 
                    f"Expected 409 for wrong expectKind, got {response.status_code}", 
                    {"response": response.text})
            return False
        
        error_data = response.json()
        if "error" not in error_data or "Text share room" not in error_data["error"]:
            log_test("B10", False, "Expected friendly error message about Text share room", 
                    {"response": error_data})
            return False
        
        print(f"    ✓ Correctly rejected with 409: {error_data['error']}")
        
        # Join with correct expectKind
        print("  Step 3: Join with correct expectKind...")
        response = requests.post(
            f"{BASE_URL}/join",
            json={
                "roomId": text_room_id,
                "deviceId": "test-guest",
                "name": "TestGuest",
                "expectKind": "text"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B10", False, f"Join with correct expectKind failed: {response.status_code}", 
                    {"response": response.text})
            return False
        
        print("    ✓ Joined successfully with correct expectKind")
        
        # Poll for both devices
        print("  Step 4: Poll for both devices...")
        for device_id in ["test-host", "test-guest"]:
            response = requests.get(
                f"{BASE_URL}/poll",
                params={"roomId": text_room_id, "deviceId": device_id},
                timeout=10
            )
            
            if response.status_code != 200:
                log_test("B10", False, f"Poll failed for {device_id}: {response.status_code}", 
                        {"response": response.text})
                return False
            
            poll_data = response.json()
            if "devices" not in poll_data:
                log_test("B10", False, f"Poll response missing 'devices' for {device_id}", 
                        {"response": poll_data})
                return False
        
        print("    ✓ Poll working for both devices")
        
        # Send point-to-point signaling message
        print("  Step 5: Send point-to-point signaling message...")
        response = requests.post(
            f"{BASE_URL}/send",
            json={
                "roomId": text_room_id,
                "fromId": "test-host",
                "toId": "test-guest",
                "payload": {"type": "offer", "sdp": "test-sdp"}
            },
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B10", False, f"Send signaling failed: {response.status_code}", 
                    {"response": response.text})
            return False
        
        print("    ✓ Signaling message sent")
        
        # Poll to verify message was queued
        time.sleep(0.3)
        response = requests.get(
            f"{BASE_URL}/poll",
            params={"roomId": text_room_id, "deviceId": "test-guest"},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("B10", False, f"Poll after send failed: {response.status_code}", 
                    {"response": response.text})
            return False
        
        poll_data = response.json()
        messages = poll_data.get("messages", [])
        signal_msg = None
        for msg in messages:
            if msg.get("type") == "signal":
                signal_msg = msg
                break
        
        if not signal_msg:
            log_test("B10", False, "Signaling message not found in poll", 
                    {"messages": messages})
            return False
        
        print("    ✓ Signaling message received via poll")
        
        # Leave for both devices
        print("  Step 6: Leave for both devices...")
        for device_id in ["test-host", "test-guest"]:
            response = requests.post(
                f"{BASE_URL}/leave",
                json={"roomId": text_room_id, "deviceId": device_id},
                timeout=10
            )
            
            if response.status_code != 200:
                log_test("B10", False, f"Leave failed for {device_id}: {response.status_code}", 
                        {"response": response.text})
                return False
        
        print("    ✓ Both devices left successfully")
        
        log_test("B10", True, "All regression smoke tests passed", 
                {"steps": [
                    "Create text room",
                    "Reject wrong expectKind with 409",
                    "Join with correct expectKind",
                    "Poll for both devices",
                    "Send point-to-point signaling",
                    "Leave for both devices"
                ]})
        return True
        
    except Exception as e:
        log_test("B10", False, f"Exception: {str(e)}", {"error": str(e)})
        return False


def main():
    """Run all backend tests B1-B10"""
    print("\n" + "="*80)
    print("BACKEND API TESTS - WiFi Files / WiFi Text Share Signaling Fixes")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    # B1: Create room
    room_id = test_b1_create_room()
    if not room_id:
        print("\n❌ CRITICAL: B1 failed, cannot continue with B2-B9")
        print_summary()
        return 1
    
    # B2: Check name (taken)
    test_b2_check_name_taken(room_id)
    
    # B3: Check name (available)
    test_b3_check_name_available(room_id)
    
    # B4: Check name (non-existent room)
    test_b4_check_name_nonexistent_room()
    
    # B5: Join with duplicate name (should become "Alice (2)")
    test_b5_join_duplicate_name(room_id)
    
    # B6: Join third device with duplicate name (should become "Alice (3)")
    test_b6_join_third_duplicate(room_id)
    
    # B7: Join fourth device with lowercase duplicate (should be deduped)
    test_b7_join_lowercase_duplicate(room_id)
    
    # B8: Large binary relay payload
    test_b8_relay_large_binary(room_id)
    
    # B9: Broadcast relay
    test_b9_relay_broadcast(room_id)
    
    # B10: Regression smoke test
    test_b10_regression_smoke()
    
    # Print summary
    print_summary()
    
    # Return exit code
    failed_tests = [t for t in test_results if not t["passed"]]
    return 1 if failed_tests else 0


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = [t for t in test_results if t["passed"]]
    failed = [t for t in test_results if not t["passed"]]
    
    print(f"\nTotal: {len(test_results)} tests")
    print(f"✅ Passed: {len(passed)}")
    print(f"❌ Failed: {len(failed)}")
    
    if failed:
        print("\nFailed tests:")
        for test in failed:
            print(f"  ❌ {test['test_id']}: {test['message']}")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    sys.exit(main())
