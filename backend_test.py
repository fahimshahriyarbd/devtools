#!/usr/bin/env python3
"""
Backend smoke test for WebRTC data-channel ping/pong verification fix.
Tests the relay endpoints to ensure cross-device transfer works correctly.
"""

import requests
import json
import base64
import os
import sys

# Backend URL from environment
BACKEND_URL = "https://dev-suite-16.preview.emergentagent.com/api/signal"

def test_b1_create_room():
    """B1. POST /api/signal/create body {"hostId":"smoke-host","hostName":"H","kind":"file"} → 200, save room.id as ROOM_ID"""
    print("\n=== B1: Create Room ===")
    url = f"{BACKEND_URL}/create"
    payload = {
        "hostId": "smoke-host",
        "hostName": "H",
        "kind": "file"
    }
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert "room" in data, "Response missing 'room' field"
    assert "id" in data["room"], "Room missing 'id' field"
    
    room_id = data["room"]["id"]
    print(f"✅ B1 PASSED - Room created: {room_id}")
    return room_id


def test_b2_join_room(room_id):
    """B2. POST /api/signal/join body {"roomId":"<ROOM_ID>","deviceId":"smoke-guest","name":"G","expectKind":"file"} → 200"""
    print("\n=== B2: Join Room ===")
    url = f"{BACKEND_URL}/join"
    payload = {
        "roomId": room_id,
        "deviceId": "smoke-guest",
        "name": "G",
        "expectKind": "file"
    }
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert "room" in data, "Response missing 'room' field"
    assert "devices" in data["room"], "Room missing 'devices' field"
    
    devices = data["room"]["devices"]
    device_names = [d["name"] for d in devices]
    
    assert "H" in device_names, f"Host 'H' not found in devices: {device_names}"
    assert "G" in device_names, f"Guest 'G' not found in devices: {device_names}"
    assert len(devices) == 2, f"Expected 2 devices, got {len(devices)}"
    
    print(f"✅ B2 PASSED - Guest joined, devices: {device_names}")


def test_b3_relay_large_binary(room_id):
    """B3. Generate a ~22KB base64 string (base64-encode 16KB random bytes). POST /api/signal/relay → 200"""
    print("\n=== B3: Relay Large Binary Payload ===")
    
    # Generate 16KB random bytes
    random_bytes = os.urandom(16 * 1024)
    base64_data = base64.b64encode(random_bytes).decode('utf-8')
    
    print(f"Generated {len(random_bytes)} bytes → {len(base64_data)} base64 chars (~{len(base64_data)/1024:.1f}KB)")
    
    url = f"{BACKEND_URL}/relay"
    payload = {
        "roomId": room_id,
        "fromId": "smoke-host",
        "toId": "smoke-guest",
        "data": base64_data,
        "binary": True
    }
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print(f"✅ B3 PASSED - Large binary payload sent ({len(base64_data)} chars)")
    
    return base64_data


def test_b4_poll_relay_data(room_id, expected_data):
    """B4. GET /api/signal/poll?roomId=<ROOM_ID>&deviceId=smoke-guest → 200; response.messages contains relay-data"""
    print("\n=== B4: Poll Relay Data ===")
    
    url = f"{BACKEND_URL}/poll"
    params = {
        "roomId": room_id,
        "deviceId": "smoke-guest"
    }
    
    response = requests.get(url, params=params)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert "messages" in data, "Response missing 'messages' field"
    
    messages = data["messages"]
    assert len(messages) > 0, "No messages received"
    
    # Find relay-data message
    relay_msg = None
    for msg in messages:
        if msg.get("type") == "relay-data":
            relay_msg = msg
            break
    
    assert relay_msg is not None, f"No relay-data message found in {len(messages)} messages"
    assert relay_msg.get("from") == "smoke-host", f"Wrong sender: {relay_msg.get('from')}"
    assert relay_msg.get("binary") == True, f"Binary flag not set: {relay_msg.get('binary')}"
    
    received_data = relay_msg.get("data")
    assert received_data == expected_data, f"Data mismatch: expected {len(expected_data)} chars, got {len(received_data)} chars"
    
    print(f"✅ B4 PASSED - Relay data received, byte-exact match ({len(received_data)} chars)")


def test_b5_relay_broadcast(room_id):
    """B5. POST /api/signal/relay with broadcast (no toId) → 200; smoke-guest's next poll receives it"""
    print("\n=== B5: Relay Broadcast ===")
    
    url = f"{BACKEND_URL}/relay"
    payload = {
        "roomId": room_id,
        "fromId": "smoke-host",
        "data": "hello-broadcast",
        "binary": False
    }
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print(f"✅ B5 PASSED - Broadcast sent")
    
    # Poll to verify
    print("\n=== B5: Poll Broadcast ===")
    poll_url = f"{BACKEND_URL}/poll"
    params = {
        "roomId": room_id,
        "deviceId": "smoke-guest"
    }
    
    response = requests.get(poll_url, params=params)
    print(f"Status: {response.status_code}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    messages = data.get("messages", [])
    
    # Find broadcast message
    broadcast_msg = None
    for msg in messages:
        if msg.get("type") == "relay-data" and msg.get("data") == "hello-broadcast":
            broadcast_msg = msg
            break
    
    assert broadcast_msg is not None, f"Broadcast message not found in {len(messages)} messages"
    print(f"✅ B5 PASSED - Broadcast received by smoke-guest")


def test_b6_check_name(room_id):
    """B6. Regression: POST /api/signal/check-name body {"roomId":"<ROOM_ID>","name":"H"} → {"taken":true,"suggested":"H (2)","exists":true}"""
    print("\n=== B6: Check Name (Regression) ===")
    
    url = f"{BACKEND_URL}/check-name"
    payload = {
        "roomId": room_id,
        "name": "H"
    }
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    
    assert data.get("taken") == True, f"Expected taken=true, got {data.get('taken')}"
    assert data.get("suggested") == "H (2)", f"Expected suggested='H (2)', got {data.get('suggested')}"
    assert data.get("exists") == True, f"Expected exists=true, got {data.get('exists')}"
    
    print(f"✅ B6 PASSED - Name check regression test passed")


def main():
    print("=" * 80)
    print("BACKEND SMOKE TEST - WebRTC Ping/Pong Verification Fix")
    print("=" * 80)
    
    try:
        # B1: Create room
        room_id = test_b1_create_room()
        
        # B2: Join room
        test_b2_join_room(room_id)
        
        # B3: Send large binary payload
        expected_data = test_b3_relay_large_binary(room_id)
        
        # B4: Poll and verify byte-exact match
        test_b4_poll_relay_data(room_id, expected_data)
        
        # B5: Broadcast relay
        test_b5_relay_broadcast(room_id)
        
        # B6: Check name regression
        test_b6_check_name(room_id)
        
        print("\n" + "=" * 80)
        print("✅ ALL BACKEND TESTS PASSED (B1-B6)")
        print("=" * 80)
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
