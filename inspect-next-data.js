import fs from 'fs';

const html = fs.readFileSync('transactions-page.html', 'utf8');
const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);

if (match) {
  const data = JSON.parse(match[1]);
  const keys = Object.keys(data.props.pageProps);
  console.log('PageProps keys:', keys);
  
  // Look for transaction-related data
  for (const key of keys) {
    console.log(`\n${key}:`, typeof data.props.pageProps[key]);
    
    if (typeof data.props.pageProps[key] === 'object' && data.props.pageProps[key]) {
      const subKeys = Object.keys(data.props.pageProps[key]);
      console.log(`  Sub-keys:`, subKeys.slice(0, 10));
    }
  }
  
  // Check if there's a transactions key
  if (data.props.pageProps.transactions) {
    console.log('\n✅ Found transactions data!');
    console.log(JSON.stringify(data.props.pageProps.transactions, null, 2).substring(0, 3000));
  }
}
