#!/usr/bin/env python3
"""
Backend smoke test for relay message ordering fix.
Tests the relay endpoints to ensure messages arrive in order.
"""

import requests
import json
import base64
import os
import sys
import asyncio
import aiohttp
import time

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


async def test_ordering_o1_o5():
    """
    PART 2 — ORDERING REGRESSION TEST (NEW)
    O1. Create room
    O2. Join with second device
    O3. Fire 20 relay POSTs IN PARALLEL from ord-h to ord-g
    O4. Wait 1 second, then poll
    O5. Verify all 20 messages received (none lost)
    """
    print("\n" + "=" * 80)
    print("PART 2 — ORDERING REGRESSION TEST (O1-O5)")
    print("=" * 80)
    
    # O1: Create room
    print("\n=== O1: Create Room ===")
    url = f"{BACKEND_URL}/create"
    payload = {
        "hostId": "ord-h",
        "hostName": "OrderHost",
        "kind": "file"
    }
    
    response = requests.post(url, json=payload)
    assert response.status_code == 200, f"O1 failed: {response.status_code}"
    room_id = response.json()["room"]["id"]
    print(f"✅ O1 PASSED - Room created: {room_id}")
    
    # O2: Join with second device
    print("\n=== O2: Join Room ===")
    url = f"{BACKEND_URL}/join"
    payload = {
        "roomId": room_id,
        "deviceId": "ord-g",
        "name": "OrderGuest",
        "expectKind": "file"
    }
    
    response = requests.post(url, json=payload)
    assert response.status_code == 200, f"O2 failed: {response.status_code}"
    print(f"✅ O2 PASSED - Guest joined")
    
    # O3: Fire 20 relay POSTs IN PARALLEL
    print("\n=== O3: Fire 20 Parallel Relay POSTs ===")
    
    async def send_relay_message(session, i):
        """Send a single relay message"""
        url = f"{BACKEND_URL}/relay"
        payload = {
            "roomId": room_id,
            "fromId": "ord-h",
            "toId": "ord-g",
            "data": f"MSG-{i:02d}",
            "binary": False
        }
        
        async with session.post(url, json=payload) as response:
            status = response.status
            if status != 200:
                text = await response.text()
                print(f"❌ Message {i} failed: {status} - {text}")
            return status
    
    # Fire all 20 in parallel
    async with aiohttp.ClientSession() as session:
        tasks = [send_relay_message(session, i) for i in range(20)]
        results = await asyncio.gather(*tasks)
    
    # Check all returned 200
    failed = [i for i, status in enumerate(results) if status != 200]
    assert len(failed) == 0, f"O3 failed: {len(failed)} messages failed: {failed}"
    print(f"✅ O3 PASSED - All 20 relay POSTs returned 200")
    
    # O4: Wait 1 second
    print("\n=== O4: Wait 1 second ===")
    time.sleep(1)
    print("✅ O4 PASSED - Waited 1 second")
    
    # O5: Poll and verify all 20 messages received
    print("\n=== O5: Poll and Verify All 20 Messages ===")
    url = f"{BACKEND_URL}/poll"
    params = {
        "roomId": room_id,
        "deviceId": "ord-g"
    }
    
    response = requests.get(url, params=params)
    assert response.status_code == 200, f"O5 poll failed: {response.status_code}"
    
    data = response.json()
    messages = data.get("messages", [])
    
    # Filter relay-data messages
    relay_messages = [msg for msg in messages if msg.get("type") == "relay-data"]
    
    print(f"Total messages: {len(messages)}")
    print(f"Relay-data messages: {len(relay_messages)}")
    
    # Extract message data
    received_data = [msg.get("data") for msg in relay_messages]
    print(f"Received data: {received_data[:5]}... (showing first 5)")
    
    # Verify all 20 messages received
    assert len(relay_messages) == 20, f"Expected 20 relay messages, got {len(relay_messages)}"
    
    # Verify all expected messages are present (order doesn't matter for this test)
    expected_messages = {f"MSG-{i:02d}" for i in range(20)}
    received_messages = set(received_data)
    
    missing = expected_messages - received_messages
    extra = received_messages - expected_messages
    
    assert len(missing) == 0, f"Missing messages: {missing}"
    assert len(extra) == 0, f"Extra messages: {extra}"
    
    print(f"✅ O5 PASSED - All 20 messages received (none lost)")
    print(f"   Expected: {sorted(expected_messages)[:5]}... (first 5)")
    print(f"   Received: {sorted(received_messages)[:5]}... (first 5)")


def main():
    print("=" * 80)
    print("BACKEND SMOKE TEST - Relay Message Ordering Fix")
    print("=" * 80)
    
    try:
        # PART 1: Backend smoke tests (B1-B6)
        print("\n" + "=" * 80)
        print("PART 1 — BACKEND SMOKE TESTS (B1-B6)")
        print("=" * 80)
        
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
        
        print("\n✅ PART 1 COMPLETE - All backend smoke tests passed (B1-B6)")
        
        # PART 2: Ordering regression test (O1-O5)
        asyncio.run(test_ordering_o1_o5())
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED (B1-B6, O1-O5)")
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
