const fs = require('fs');
const path = require('path');

const viewDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public');

const walkSync = (dir, filelist = []) => {
    if(!fs.existsSync(dir)) return filelist;
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            filelist = walkSync(filepath, filelist);
        } else {
            if (filepath.endsWith('.ejs') || filepath.endsWith('.css')) {
                filelist.push(filepath);
            }
        }
    });
    return filelist;
};

const allFiles = [...walkSync(viewDir), ...walkSync(publicDir)];

allFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Remove all font-family declarations except 'Inter' and standard system-ui ones if we wanted to keep them, but let's just strip ALL and rely on the global one.
    // wait, if we drop all font-family, bootstrap-icons might break if they depend on font-family: bootstrap-icons line in custom css? No, bootstrap-icons relies on its own css which is loaded from CDN usually.
    content = content.replace(/font-family:\s*[^;{}]+;/gi, (match) => {
        if(match.includes('bootstrap-icons')) return match;
        if(match.includes('FontAwesome')) return match;
        return ''; 
    });

    // Remove random font-sizes from specific standard classes? User said "Remove all other fonts." And "Remove random font sizes".
    // Let's strip font-size from EJS <style> and CSS for text, but this is dangerous for layout.
    // I will replace font-sizes and font-weights with the standard ones IF they are matched cleanly, or just remove them to rely on global.
    // Let's rely on a global CSS for font-size enforcement so we don't break layout padding/widths.
    
    // Removing literal font family from google fonts link 
    content = content.replace(/<link[^>]*href=['"]https:\/\/fonts.googleapis.com\/css2\?family=[^>]*['"][^>]*>/gi, '');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Processed:', file);
    }
});

console.log('Font families and Google fonts removed.');
