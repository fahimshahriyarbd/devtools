#!/usr/bin/env python3
"""
Backend test for WiFi Files/Text share signaling API bug fix.

Bug fix: check-name endpoint now suggests random "Device-XXXX" names
when the requested name is taken, instead of appending " (2)".
The join endpoint still dedupes with " (2)" if user ignores suggestion.
"""
import re
import requests
import sys

# Backend URL from frontend/.env
BASE_URL = "https://dev-toolkit-102.preview.emergentagent.com/api"

# Regex pattern for Device-XXXX format (4 uppercase alphanumeric chars)
DEVICE_NAME_PATTERN = re.compile(r'^Device-[A-Z0-9]{4}$')

def test_file_share_room():
    """Test all scenarios with a file-share room."""
    print("\n" + "="*80)
    print("TEST 1: File-share room workflow")
    print("="*80)
    
    # 1. Create file-share room with host name "Alice"
    print("\n[1] Creating file-share room with hostName='Alice'...")
    create_resp = requests.post(
        f"{BASE_URL}/signal/create",
        json={"kind": "file", "hostName": "Alice", "hostId": "host-A-uuid"}
    )
    assert create_resp.status_code == 200, f"Create failed: {create_resp.status_code} {create_resp.text}"
    create_data = create_resp.json()
    room_code = create_data["room"]["id"]
    print(f"✓ Room created: {room_code}")
    print(f"  Room data: {create_data['room']}")
    
    # 2. check-name with NEW name "Bob" (not taken)
    print("\n[2] check-name with NEW name 'Bob'...")
    check_bob = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "Bob"}
    )
    assert check_bob.status_code == 200, f"check-name failed: {check_bob.status_code} {check_bob.text}"
    bob_data = check_bob.json()
    print(f"  Response: {bob_data}")
    assert bob_data["taken"] == False, f"Expected taken=False, got {bob_data['taken']}"
    assert bob_data["suggested"] == "Bob", f"Expected suggested='Bob', got {bob_data['suggested']}"
    assert bob_data["exists"] == True, f"Expected exists=True, got {bob_data['exists']}"
    print("✓ PASS: taken=False, suggested='Bob', exists=True")
    
    # 3. check-name with TAKEN name "Alice"
    print("\n[3] check-name with TAKEN name 'Alice'...")
    check_alice = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "Alice"}
    )
    assert check_alice.status_code == 200, f"check-name failed: {check_alice.status_code} {check_alice.text}"
    alice_data = check_alice.json()
    print(f"  Response: {alice_data}")
    assert alice_data["taken"] == True, f"Expected taken=True, got {alice_data['taken']}"
    assert alice_data["exists"] == True, f"Expected exists=True, got {alice_data['exists']}"
    
    # CRITICAL: suggested should match Device-XXXX pattern
    suggested1 = alice_data["suggested"]
    assert DEVICE_NAME_PATTERN.match(suggested1), \
        f"Expected suggested to match 'Device-[A-Z0-9]{{4}}', got '{suggested1}'"
    print(f"✓ PASS: taken=True, suggested='{suggested1}' (matches Device-XXXX pattern)")
    
    # Call check-name again to verify randomization
    print("\n[3b] check-name with 'Alice' again (verify randomization)...")
    check_alice2 = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "Alice"}
    )
    alice_data2 = check_alice2.json()
    suggested2 = alice_data2["suggested"]
    print(f"  Response: {alice_data2}")
    assert DEVICE_NAME_PATTERN.match(suggested2), \
        f"Expected suggested to match 'Device-[A-Z0-9]{{4}}', got '{suggested2}'"
    print(f"✓ PASS: suggested='{suggested2}' (matches Device-XXXX pattern)")
    if suggested1 != suggested2:
        print(f"  Note: Suggestions differ ('{suggested1}' vs '{suggested2}') - randomization working")
    else:
        print(f"  Note: Suggestions same ('{suggested1}') - acceptable by chance")
    
    # 4. check-name with case variation "alice" (case-insensitive)
    print("\n[4] check-name with case variation 'alice'...")
    check_alice_lower = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "alice"}
    )
    assert check_alice_lower.status_code == 200, f"check-name failed: {check_alice_lower.status_code}"
    alice_lower_data = check_alice_lower.json()
    print(f"  Response: {alice_lower_data}")
    assert alice_lower_data["taken"] == True, f"Expected taken=True (case-insensitive), got {alice_lower_data['taken']}"
    suggested_lower = alice_lower_data["suggested"]
    assert DEVICE_NAME_PATTERN.match(suggested_lower), \
        f"Expected suggested to match 'Device-[A-Z0-9]{{4}}', got '{suggested_lower}'"
    print(f"✓ PASS: taken=True (case-insensitive), suggested='{suggested_lower}' (matches Device-XXXX)")
    
    # 5. join with duplicate name "Alice" → should dedupe to "Alice (2)"
    print("\n[5] join with duplicate name 'Alice' (should dedupe to 'Alice (2)')...")
    join_resp = requests.post(
        f"{BASE_URL}/signal/join",
        json={"roomId": room_code, "name": "Alice", "deviceId": "dev-B-uuid", "expectKind": "file"}
    )
    assert join_resp.status_code == 200, f"join failed: {join_resp.status_code} {join_resp.text}"
    join_data = join_resp.json()
    print(f"  Response: {join_data}")
    
    # Find the device with id "dev-B-uuid" in room.devices
    devices = join_data["room"]["devices"]
    dev_b = next((d for d in devices if d["id"] == "dev-B-uuid"), None)
    assert dev_b is not None, "Device 'dev-B-uuid' not found in room.devices"
    assert dev_b["name"] == "Alice (2)", f"Expected name='Alice (2)', got '{dev_b['name']}'"
    print(f"✓ PASS: Device 'dev-B-uuid' has name='Alice (2)' (join-time dedupe working)")
    print(f"  All devices in room: {[d['name'] for d in devices]}")
    
    # 6. check-name after second Alice joined
    print("\n[6] check-name with 'Alice' after second device joined...")
    check_alice3 = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "Alice"}
    )
    alice_data3 = check_alice3.json()
    suggested3 = alice_data3["suggested"]
    print(f"  Response: {alice_data3}")
    assert alice_data3["taken"] == True, f"Expected taken=True, got {alice_data3['taken']}"
    assert DEVICE_NAME_PATTERN.match(suggested3), \
        f"Expected suggested to match 'Device-[A-Z0-9]{{4}}', got '{suggested3}'"
    
    # Verify suggested name doesn't collide with existing names
    existing_names = [d["name"] for d in devices]
    assert suggested3 not in existing_names, \
        f"Suggested name '{suggested3}' collides with existing names {existing_names}"
    print(f"✓ PASS: suggested='{suggested3}' (matches Device-XXXX, no collision with {existing_names})")
    
    print("\n" + "="*80)
    print("✓ ALL FILE-SHARE TESTS PASSED")
    print("="*80)
    return True


def test_text_share_room():
    """Test the same workflow with a text-share room."""
    print("\n" + "="*80)
    print("TEST 2: Text-share room workflow")
    print("="*80)
    
    # Create text-share room with host name "Charlie"
    print("\n[7a] Creating text-share room with hostName='Charlie'...")
    create_resp = requests.post(
        f"{BASE_URL}/signal/create",
        json={"kind": "text", "hostName": "Charlie", "hostId": "host-C-uuid"}
    )
    assert create_resp.status_code == 200, f"Create failed: {create_resp.status_code} {create_resp.text}"
    create_data = create_resp.json()
    room_code = create_data["room"]["id"]
    print(f"✓ Room created: {room_code}")
    print(f"  Room data: {create_data['room']}")
    
    # check-name with "Charlie" → should suggest Device-XXXX
    print("\n[7b] check-name with TAKEN name 'Charlie'...")
    check_charlie = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": room_code, "name": "Charlie"}
    )
    assert check_charlie.status_code == 200, f"check-name failed: {check_charlie.status_code}"
    charlie_data = check_charlie.json()
    print(f"  Response: {charlie_data}")
    assert charlie_data["taken"] == True, f"Expected taken=True, got {charlie_data['taken']}"
    suggested = charlie_data["suggested"]
    assert DEVICE_NAME_PATTERN.match(suggested), \
        f"Expected suggested to match 'Device-[A-Z0-9]{{4}}', got '{suggested}'"
    print(f"✓ PASS: taken=True, suggested='{suggested}' (matches Device-XXXX)")
    
    # join with name="Charlie" → should dedupe to "Charlie (2)"
    print("\n[7c] join with duplicate name 'Charlie' (should dedupe to 'Charlie (2)')...")
    join_resp = requests.post(
        f"{BASE_URL}/signal/join",
        json={"roomId": room_code, "name": "Charlie", "deviceId": "dev-D-uuid", "expectKind": "text"}
    )
    assert join_resp.status_code == 200, f"join failed: {join_resp.status_code} {join_resp.text}"
    join_data = join_resp.json()
    print(f"  Response: {join_data}")
    
    devices = join_data["room"]["devices"]
    dev_d = next((d for d in devices if d["id"] == "dev-D-uuid"), None)
    assert dev_d is not None, "Device 'dev-D-uuid' not found in room.devices"
    assert dev_d["name"] == "Charlie (2)", f"Expected name='Charlie (2)', got '{dev_d['name']}'"
    print(f"✓ PASS: Device 'dev-D-uuid' has name='Charlie (2)' (join-time dedupe working)")
    print(f"  All devices in room: {[d['name'] for d in devices]}")
    
    print("\n" + "="*80)
    print("✓ ALL TEXT-SHARE TESTS PASSED")
    print("="*80)
    return True


def test_nonexistent_room():
    """Test check-name for a non-existent room."""
    print("\n" + "="*80)
    print("TEST 3: Non-existent room edge case")
    print("="*80)
    
    print("\n[8] check-name for non-existent room 'ZZZZ'...")
    check_resp = requests.post(
        f"{BASE_URL}/signal/check-name",
        json={"roomId": "ZZZZ", "name": "Anyone"}
    )
    assert check_resp.status_code == 200, f"check-name failed: {check_resp.status_code}"
    data = check_resp.json()
    print(f"  Response: {data}")
    assert data["exists"] == False, f"Expected exists=False, got {data['exists']}"
    assert data["taken"] == False, f"Expected taken=False, got {data['taken']}"
    assert data["suggested"] == "Anyone", f"Expected suggested='Anyone' (unchanged), got '{data['suggested']}'"
    print("✓ PASS: exists=False, taken=False, suggested='Anyone' (unchanged)")
    
    print("\n" + "="*80)
    print("✓ NON-EXISTENT ROOM TEST PASSED")
    print("="*80)
    return True


def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("BACKEND SIGNALING API BUG FIX VERIFICATION")
    print("Testing: check-name suggests Device-XXXX when name is taken")
    print("Backend URL:", BASE_URL)
    print("="*80)
    
    try:
        # Test file-share room (scenarios 1-6)
        test_file_share_room()
        
        # Test text-share room (scenario 7)
        test_text_share_room()
        
        # Test non-existent room (scenario 8)
        test_nonexistent_room()
        
        print("\n" + "="*80)
        print("✓✓✓ ALL TESTS PASSED ✓✓✓")
        print("="*80)
        print("\nSUMMARY:")
        print("  ✓ File-share room: check-name suggests Device-XXXX for taken names")
        print("  ✓ Text-share room: check-name suggests Device-XXXX for taken names")
        print("  ✓ Join endpoint still dedupes with ' (2)' when user ignores suggestion")
        print("  ✓ Case-insensitive name matching works correctly")
        print("  ✓ Non-existent room returns exists=False")
        print("  ✓ Suggested names don't collide with existing device names")
        print("\nBug fix is working correctly!")
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
