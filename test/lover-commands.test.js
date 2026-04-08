const assert = require('assert');

function testParseLoverCommand() {
  const { parseCommand } = require('../scripts/lover-commands');

  assert(parseCommand('/lover talk').cmd === 'talk', 'talk command');
  assert(parseCommand('/lover report').cmd === 'report', 'report command');
  assert(parseCommand('/lover profile').cmd === 'profile', 'profile command');
  assert(parseCommand('/lover advice 我不知道怎么追').cmd === 'advice', 'advice command');
  assert(parseCommand('/lover advice').args === '', 'empty advice');
  assert(parseCommand('/lover setup').cmd === 'setup', 'setup command');
  assert(parseCommand('我想聊聊恋爱').cmd === 'auto', 'auto activation');
}

function testDetectLoveTopic() {
  const { detectLoveTopic } = require('../scripts/lover-commands');

  assert(detectLoveTopic('我想找个对象') === true, '对象');
  assert(detectLoveTopic('不知道怎么追男生') === true, '追男生');
  assert(detectLoveTopic('恋爱好难') === true, '恋爱');
  assert(detectLoveTopic('今天工作很累') === false, 'unrelated');
}

testParseLoverCommand();
testDetectLoveTopic();
console.log('All lover commands tests passed');
