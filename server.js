const express = require('express');
const fs = require('fs');
const path = require('path');
const Lock = require('async-lock');
const cors = require('cors'); // 允许跨域请求
const app = express();
const PORT = 3000;
const lock = new Lock();

// 允许处理JSON数据
app.use(express.json());

// 允许跨域访问
app.use(cors());

// 路径配置 (根目录下的 resdata.js, tpdata.js 和 index.html)
const resDataPath = path.join(__dirname, 'resdata.js');
const tpDataPath = path.join(__dirname, 'tpdata.js');
const indexPath = path.join(__dirname, 'index.html');

// 处理根目录请求，发送 index.html
app.get('/', (req, res) => {
    res.sendFile(indexPath);
});

// 读取 resdata.js 数据
app.get('/resdata', (req, res) => {
    fs.readFile(resDataPath, 'utf-8', (err, data) => {
        if (err) {
            return res.status(500).send('读取 resdata.js 失败');
        }
        const resData = eval(data.replace('const resData =', '').trim()); // 解析文件内容为JS对象
        res.json(resData);
    });
});

// 处理投票请求
app.post('/vote', (req, res) => {
    const { ipAddress, voteTime, votedFor } = req.body;

    // 验证请求数据
    if (!ipAddress || !voteTime || !votedFor) {
        return res.status(400).send('请求数据不完整');
    }

    lock.acquire('voteLock', (done) => {
        // 更新 tpdata.js
        fs.readFile(tpDataPath, 'utf-8', (err, tpDataFile) => {
            if (err) {
                done(); // 释放锁
                return res.status(500).send('读取 tpdata.js 失败');
            }
            let tpData = eval(tpDataFile.replace('const tpData =', '').trim());

            // 添加新的投票记录
            tpData.push({ ip: ipAddress, time: voteTime, votedFor });

            // 保存到 tpdata.js
            const newTpData = `const tpData = ${JSON.stringify(tpData, null, 2)};`;
            fs.writeFile(tpDataPath, newTpData, 'utf-8', (err) => {
                if (err) {
                    done(); // 释放锁
                    return res.status(500).send('保存 tpdata.js 失败');
                }

                // 更新 resdata.js
                fs.readFile(resDataPath, 'utf-8', (err, resDataFile) => {
                    if (err) {
                        done(); // 释放锁
                        return res.status(500).send('读取 resdata.js 失败');
                    }
                    let resData = eval(resDataFile.replace('const resData =', '').trim());

                    // 找到对应的人并增加票数
                    const votedPerson = resData.find(person => person.name === votedFor);
                    if (votedPerson) {
                        votedPerson.votes += 1;
                    }

                    // 保存更新后的 resdata.js
                    const newResData = `const resData = ${JSON.stringify(resData, null, 2)};`;
                    fs.writeFile(resDataPath, newResData, 'utf-8', (err) => {
                        done();
                        if (err) {
                            return res.status(500).send('保存 resdata.js 失败');
                        }
                        res.send({ message: '投票成功！', resData });
                    });
                });
            });
        });
    }, (err) => {
        if (err) {
            console.error('Lock acquisition failed:', err);
        }
    });
});

// 启动服务器并监听指定的 IP 和端口
app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动，监听 IP 0.0.0.0 端口 ${PORT}`);
});