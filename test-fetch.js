import fetch from 'node-fetch';

async function testFetch() {
  try {
    console.log('Testing fetch to CBS...');
    const response = await fetch('https://www.cbssports.com/nba/scoreboard/', {
      timeout: 5000 // 5 second timeout
    });
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    if (response.ok) {
      const html = await response.text();
      console.log('HTML length:', html.length);
      console.log('First 200 chars:', html.substring(0, 200));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFetch();