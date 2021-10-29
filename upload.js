const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');

const staticFileDir = ['css', 'example-code', 'fonts', 'img', 'js', 'less', 'projects'];

module.exports = async ({github, context, core}) => {
    const COS_SECRET_ID = core.getInput('COS_SECRET_ID');
    const COS_SECRET_KEY = core.getInput('COS_SECRET_KEY');
    const COS_BUCKET = core.getInput('COS_BUCKET');
    const COS_REGION = core.getInput('COS_REGION');
    const shit = core.getInput('shit');
    // Note: 获取
    var cos = new COS({
        SecretId: COS_SECRET_ID,
        SecretKey: COS_SECRET_KEY
    });
    console.log('shit:', shit);
    // Note: action/github 中的 github.event.commits 对象中并不包含 added modifiy removed 等资源（shit！） https://docs.github.com/cn/actions/learn-github-actions/events-that-trigger-workflows#push
    //  API 发送接口看这个： https://docs.github.com/cn/rest/reference/repos#get-a-commit
    //  所以需要手动发送请求获取 change，因此我用 compare 接口：https://docs.github.com/cn/rest/reference/repos#compare-two-commits
    //  参考了这个人的 aciton： https://github.com/jitterbit/get-changed-files/blob/master/src/main.ts
    //  不过该 API 已经废弃了，要使用这个接口： compareCommitsWithBasehead

    const base = context.payload.before;
    const head = context.payload.after;
    console.log('之前的 hash:', base);
    console.log('现在的 hash:', head);

    const response = await github.rest.repos.compareCommitsWithBasehead({
        basehead: `${base}...${head}`,
        owner: context.repo.owner,
        repo: context.repo.repo
    });
    if (response.status !== 200) {
        core.setFailed(
          `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200. ` +
            "Please submit an issue on this action's GitHub repo."
        )
    }
    if (response.data.status !== 'ahead') {
        core.setFailed(
          `head commit 的 id 落后于 base commit，搞错了吧？`
        )
    }
    const files = response.data.files;
    // Note: 从 push 事件中获取到相关文件变动信息，然后进行相应的上传和删除
    const addAndModifyList = [];
    const removedList = [];
    const renamed = [];
    for (const file of files) {
        const filename = file.filename;
        switch (file.status) {
            case 'added':
            case 'modified':
                addAndModifyList.push(filename);
                break;
            case 'removed':
                removedList.push(filename);
                break;
            case 'renamed':
                // Note: 重命名的，需要删了旧的，上传新的
                addAndModifyList.push(filename);
                removedList.push(file.previous_filename);
            default:
                // Note: 还有一种 renamed 的不处理
                renamed.push({
                    [file.status]: file
                });
                break;
        }
    }
    console.log('添加或修改的文件列表:', addAndModifyList);
    console.log('移除的文件列表:', removedList);
    console.log('重命名的文件有:', renamed);

    const ignored = [];
    const addFiles = [];
    const removedFiles = [];
    for (let fileName of addAndModifyList) {
        // Note: 只处理静态资源文件夹下的文件
        if (staticFileDir.some(dir => fileName.startsWith(dir))) {
            console.log('文件即将被上传:', fileName);
            addFiles.push({
                Bucket: COS_BUCKET,
                Region: COS_REGION,
                Key: fileName,
                FilePath: fileName,
                onTaskReady: () => {
                    console.log(`准备开始上传:${fileName}`);
                }
            });
        } else {
            ignored.push(fileName);
        }
    }
    if (ignored.length) {
        console.log('本次忽略上传的文件有:', ignored);
    }

    for (let fileName of removedList) {
        if (staticFileDir.some(dir => fileName.startsWith(dir))) {
            console.log('即将删除文件:', fileName);
            removedFiles.push({
                Key: fileName
            });
        }
    }

    // Note: 执行上传
    if (addAndModifyList.length) {
        cos.uploadFiles({
            files: addFiles,
            SliceSize: 1024 * 1024 * 10,    /* 设置大于10MB采用分块上传 */
            onProgress: function (info) {
                var percent = parseInt(info.percent * 10000) / 100;
                var speed = parseInt(info.speed / 1024 / 1024 * 100) / 100;
                console.log('进度:' + percent + '%; 速度：' + speed + 'Mb/s;');
            },
            onFileFinish: function (err, data, options) {
                console.log(options.Key + '上传' + (err ? ('失败:' + err.statusCode + err) : '完成'));
                console.log('--------------------------------------------');
            },
        }, function (err, data) {
            if (err) {
                console.log(`批量上传错误码: ${err.statusCode}, ${err}`);
            } else {
                console.log('批量上传完成:', data);
            }
        });
    } else {
        console.log('本次没有需要上传的文件');
    }
    
    // Note: 执行删除
    if (removedList.length) {
        cos.deleteMultipleObject({
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Objects: removedFiles,
        }, function(err, data) {
            if (err) {
                console.log('删除过程出现错误:', err);
            } else {
                console.log('删除结果:', data);
            }
        });
    } else {
        console.log('本次没有需要删除的文件');
    }
}