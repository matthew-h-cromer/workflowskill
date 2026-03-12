const fs = require('fs')
const path = require('path')
exports.SKILL_MD = fs.readFileSync(path.join(__dirname, 'skill', 'SKILL.md'), 'utf-8')
