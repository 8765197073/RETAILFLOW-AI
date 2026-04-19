import fs from 'fs';
import path from 'path';

function removeLogs(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      removeLogs(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      // Replace console.log / error / warn
      content = content.replace(/^[ \t]*console\.(log|error|warn)\(.*?\);?[ \t]*$/gm, '');
      content = content.replace(/^[ \t]*console\.(log|error|warn)\([\s\S]*?\);?[ \t]*$/gm, '');
      // Some console logs might be on same line after a block, simple global regex
      content = content.replace(/console\.(log|error|warn)\(.*?\);?/g, '/* log removed */');
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.info('Cleaned:', fullPath);
      }
    }
  }
}

removeLogs('./src');
removeLogs('./public');
