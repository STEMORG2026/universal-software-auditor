const key = 'AKIAIOSFODNN7EXAMPLE';
eval(process.argv[2]);

// Planted: certificate validation turned off.
// CodeQL: js/disabling-certificate-validation (error, CWE-295).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Planted: an RSA key below 2048 bits.
// CodeQL: js/insufficient-key-size (warning, CWE-326).
require('crypto').generateKeyPairSync('rsa', { modulusLength: 1024 });

console.log(key.length);
