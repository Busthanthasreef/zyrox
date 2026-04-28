// Native fetch used

const BASE_URL = 'http://localhost:2999';

async function runTests() {
    console.log('--- STARTING AUTH AUDIT TESTS ---');

    // 1. Test Duplicate Email
    console.log('\n[TEST 1] Duplicate Email Registration');
    try {
        const res = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                name: 'Test User',
                email: 'busthanthasreef3@gmail.com', // Assuming this exists
                phone: '9876543210',
                password: 'Password@123',
                confirmPassword: 'Password@123'
            })
        });
        console.log('Status:', res.status);
        console.log('Redirected to:', res.url);
        if (res.url.includes('/signup')) {
            console.log('RESULT: SUCCESS (Redirected back to signup as expected)');
        } else {
            console.log('RESULT: FAIL (Unexpected redirect)');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    // 2. Test Invalid Login
    console.log('\n[TEST 2] Invalid Login (Wrong Password)');
    try {
        const res = await fetch(`${BASE_URL}/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'busthanthasreef3@gmail.com',
                password: 'WrongPassword123!'
            })
        });
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Response:', data);
        if (data.success === false && data.message === 'Incorrect Password') {
            console.log('RESULT: SUCCESS (Proper error message returned)');
        } else {
            console.log('RESULT: FAIL (Unexpected response)');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    // 3. Test Non-existent User Login
    console.log('\n[TEST 3] Non-existent User Login');
    try {
        const res = await fetch(`${BASE_URL}/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'ghost@nonexistent.com',
                password: 'AnyPassword123!'
            })
        });
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Response:', data);
        if (data.success === false && data.message === 'User not found') {
            console.log('RESULT: SUCCESS (Proper error message returned)');
        } else {
            console.log('RESULT: FAIL (Unexpected response)');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    // 4. Test Protected Route Access
    console.log('\n[TEST 4] Protected Route Access (Guest)');
    try {
        const res = await fetch(`${BASE_URL}/cart`, { redirect: 'manual' });
        console.log('Status:', res.status);
        console.log('Location Header:', res.headers.get('location'));
        if (res.status === 302 && res.headers.get('location').includes('/signin')) {
            console.log('RESULT: SUCCESS (Redirected to signin)');
        } else {
            console.log('RESULT: FAIL (Should redirect to signin)');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    console.log('\n--- AUDIT TESTS COMPLETE ---');
}

runTests();
