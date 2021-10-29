const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');

const staticFileDir = ['css', 'example-code', 'fonts', 'img', 'js', 'less', 'projects'];

module.exports = async ({github, context, core}) => {
    const {
        COS_SECRET_ID,
        COS_SECRET_KEY,
        COS_BUCKET,
        COS_REGION,
        GITHUB_EVENT,
    } = process.env
    // Note: 获取
    var cos = new COS({
        SecretId: `${COS_SECRET_ID}`,
        SecretKey: `${COS_SECRET_KEY}`
    });
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
    const ignored = [];
    for (const file in files) {
        const filename = file.filename;
        switch (file.status) {
            case 'added':
            case 'modified':
                addAndModifyList.push(filename);
                break;
            case 'removed':
                removedList.push(filename);
                break;
            default:
                // Note: 还有一种 renamed 的不处理
                ignored.push({
                    [file.status]: file
                });
                break;
        }
    }
    console.log('未处理的文件有:', ignored);
    // Note: 去重
    console.log('添加或修改的文件列表:', addAndModifyList);
    console.log('移除的文件列表:', removedList);

    const addFiles = [];
    for (let fileName of addAndModifyList.keys()) {
        // Note: 只处理静态资源文件夹下的文件
        if (staticFileDir.some(dir => fileName.startsWith(dir))) {
            console.log('文件即将被上传:', fileName);
            addFiles.push({
                Bucket: `${COS_BUCKET}`,
                Region: `${COS_REGION}`,
                Key: fileName,
                FilePath: fileName,
                onProgress: function (processData) {
                    console.log(JSON.stringify('进度:', processData.percent, processData.speed));
                }
            });
        }
    }

    const removeFiles = [];
    for (let fileName of removedList.keys()) {
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
        Bucket: `${COS_BUCKET}`,
        Region: `${COS_REGION}`,
        Objects: removeFiles,
    }, function(err, data) {
        if (err) {
            console.log('删除过程出现错误:', err);
        } else {
            console.log('删除结果:', data);
        }
    });
}