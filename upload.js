var COS = require('cos-nodejs-sdk-v5');
var fs = require('fs');

module.exports = ({github, contex, secrets}) => {
    // Note: 获取
    var cos = new COS({
        SecretId: `${secrets.COS_SECRET_ID}`,
        SecretKey: `${secrets.COS_SECRET_KEY}`
     });
     // Note: 从 push 事件中获取到相关文件变动信息，然后进行相应的上传和删除
     const addAndModifyList = {};
     const deleteList = {};
     github.event.commits.forEach((commit) => {
         console.log(commits);
     });
}