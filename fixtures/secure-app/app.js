const parsed = JSON.parse(process.argv[2] ?? '{}');
console.log(Object.keys(parsed).length);
