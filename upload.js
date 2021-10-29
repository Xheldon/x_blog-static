const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');

const staticFileDir = ['css', 'example-code', 'fonts', 'img', 'js', 'less', 'projects'];

module.exports = ({github, contex, secrets}) => {
    // Note: 获取
    var cos = new COS({
        SecretId: `${secrets.COS_SECRET_ID}`,
        SecretKey: `${secrets.COS_SECRET_KEY}`
    });
    // Note: 从 push 事件中获取到相关文件变动信息，然后进行相应的上传和删除
    const _addAndModifyList = [];
    const _deleteList = [];
    github.event.commits.forEach((commit) => {
        addAndModifyList.concat(commit.added).concat(commit.modified);
        deleteList.concat(commit.removed);
    });
    // Note: 去重
    const addAndModifyList = new Set(Array.from(_addAndModifyList));
    const deleteList = new Set(Array.from(deleteList));
    console.log('添加或修改的文件列表:', addAndModifyList);
    console.log('移除的文件列表:', deleteList);

    const addFiles = [];
    for (let fileName of addAndModifyList.keys()) {
        // Note: 只处理静态资源文件夹下的文件
        if (staticFileDir.some(dir => fileName.startsWith(dir))) {
            console.log('文件即将被上传:', fileName);
            addFiles.push({
                Bucket: `${secrets.COS_BUCKET}`,
                Region: `${secrets.COS_REGION}`,
                Key: fileName,
                FilePath: fileName,
                onProgress: function (processData) {
                    console.log(JSON.stringify('进度:', processData.percent, processData.speed));
                }
            });
        }
    }

    const removeFiles = [];
    for (let fileName of deleteList.keys()) {
        if (staticFileDir.some(dir => fileName.startsWith(dir))) {
            console.log('即将删除文件:', fileName);
            removeFiles.push({
                Key: fileName
            });
        }
    }

    // Note: 执行上传
    cos.uploadFiles({
        files: addFiles,
        SliceSize: 1024 * 1024 * 10,    /* 设置大于10MB采用分块上传 */
        onProgress: function (info) {
            var percent = parseInt(info.percent * 10000) / 100;
            var speed = parseInt(info.speed / 1024 / 1024 * 100) / 100;
            console.log('进度：' + percent + '%; 速度：' + speed + 'Mb/s;');
        },
        onFileFinish: function (err, data, options) {
            console.log(options.Key + '上传' + (err ? '失败' : '完成'));
        },
    });

    // Note: 执行删除
    cos.deleteMultipleObject({
        Bucket: `${secrets.COS_BUCKET}`,
        Region: `${secrets.COS_REGION}`,
        Objects: removeFiles,
    }, function(err, data) {
        if (err) {
            console.log('删除过程出现错误:', err);
        } else {
            console.log('删除结果:', data);
        }
    });
}