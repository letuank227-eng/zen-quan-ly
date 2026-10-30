const fs = require('fs');
const path = require('path');

const tingWav = fs.readFileSync(path.join(__dirname, 'client', 'public', 'sounds', 'ting.wav'));
const popWav = fs.readFileSync(path.join(__dirname, 'client', 'public', 'sounds', 'pop.wav'));

const tingBase64 = `data:audio/wav;base64,${tingWav.toString('base64')}`;
const popBase64 = `data:audio/wav;base64,${popWav.toString('base64')}`;

const tsContent = `// Auto-generated audio Data URIs for 100% offline, zero-network instant playback
export const TING_SOUND_URI = '${tingBase64}';
export const POP_SOUND_URI = '${popBase64}';
`;

fs.writeFileSync(path.join(__dirname, 'client', 'src', 'utils', 'soundData.ts'), tsContent);
console.log('Successfully wrote soundData.ts with embedded Base64 WAVs!');
