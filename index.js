const express = require('express');
const serverless = require('serverless-http');
var bodyParser = require("body-parser");
var cors = require('cors');
const multer  = require('multer');
const storage = multer.memoryStorage()
const upload = multer({ storage: storage, dest: 'init-codes/' })
const readXlsxFile = require('read-excel-file/node');
const writeXlsxFile = require('write-excel-file/node');
const axios = require('axios');
const { Pool } = require('pg');
const dbConfig = {
	user: 'postgres',
	password: 'admin@pass123',
	host: '143.198.90.136',
	port: '5432',
	database: 'jamsai-16y-mtl',
};
const client = new Pool(dbConfig);
const app = express();
const process = {
    env: {
        "stage": "/uat",
        "JAMSAI_API_URL": "https://kd15vees64.execute-api.ap-southeast-1.amazonaws.com/uat",
        "JAMSAI_API_AUTHEN_URL": "https://jsauth.auth.ap-southeast-1.amazoncognito.com/oauth2/token",
        "JAMSAI_API_CLIENT_ID": "djpouc9pmk0dldi9i3oprrjm1",
        "JAMSAI_API_CLIENT_SECRET": "8vsn9uprs8sh16ar7md09oj2rmlsqno52vldnq68001q7jfv8tk",
        "JAMSAI_EMAIL_API_URL": "https://165jxdcmhj.execute-api.ap-southeast-1.amazonaws.com/uat",
        "JAMSAI_EMAIL_API_AUTHEN_URL": "https://uat-jamsai-staff.auth.ap-southeast-1.amazoncognito.com/oauth2/token",
        "JAMSAI_EMAIL_API_CLIENT_ID": "6iji0et1gk4ie937jeg7q4ps55",
        "JAMSAI_EMAIL_API_CLIENT_SECRET": "1t8gq8hktecdbdjnorau1trpthsjldl1g8trcqge2848l13pflrp",
        "JAMSAI_LINE_API_URL": "https://kd15vees64.execute-api.ap-southeast-1.amazonaws.com/uat"
    }
};

// #region Declare functions
// #region Private functions
const getToken = async () => {
    try {
        const res = await axios({
            method: 'post',
            url: process.env.JAMSAI_API_AUTHEN_URL,
            data: {
                grant_type: 'client_credentials'
            },
            headers: {
                'Content-Type': `application/x-www-form-urlencoded`,
            },
            auth: {
                username: process.env.JAMSAI_API_CLIENT_ID,
                password: process.env.JAMSAI_API_CLIENT_SECRET
            },
        })
        return res.data;
    } catch (err) {
        console.log("Error getToken:", err);
        return null;
    }
};
const getTokenEmail = async () => {
    try {
        const res = await axios({
            method: 'post',
            url: process.env.JAMSAI_EMAIL_API_AUTHEN_URL,
            data: {
                grant_type: 'client_credentials',
                client_id: process.env.JAMSAI_EMAIL_API_CLIENT_ID,
                client_secret: process.env.JAMSAI_EMAIL_API_CLIENT_SECRET
            },
            headers: {
                'Content-Type': `application/x-www-form-urlencoded`,
            },
        })
        return res.data;
    } catch (err) {
        console.log("Error getTokenEmail:", err);
        return null;
    }
};
const isEmail = (email) => {
    return email.includes('@') && email.includes('.');
};
const address = (item) => {
    return item.house_no + ' '
    + item.village_no + ' '
    + item.road + ' '
    + item.sub_district + ', '
    + item.district + ', '
    + item.province + ' ' + item.postalcode
}
const linkAccount = async (jamsai_id, token) => {
    try {
        const result = await axios({
            method: 'post',
            url: process.env.JAMSAI_LINE_API_URL + '/line_api/link',
            headers: {
                'Content-Type': `application/json`,
                'Authorization': 'Bearer ' + token,
            },
            data: { jamsai_id }
        })
        return true;
    } catch (err) {
        console.log("Error linkAccount:", err);
        return false
    }
}
// #endregion

const checkLogin = async (req, res) => {
    try {
        const { user, token } = req.body;
        const result = await axios({
            method: 'get',
            url: process.env.JAMSAI_LINE_API_URL + '/line_api/users/me?including_wallet=true',
            headers: {
                'Content-Type': `application/json`,
                'Authorization': 'Bearer ' + token,
            },
        })
        res.send(result.data)
    } catch (err) {
        const { config, request, response, ...error } = err;
        if (response) {
            const { config, request, ...res_error } = response;
            const error_res = {
                ...error,
                ...res_error,
            }
            console.log("Error checkLogin:", error_res);
        } else {
            console.log("Error checkLogin:", error);
        }
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while checking login",
        });
   }
}
const login = async (req, res) => {
    try {
      const { user, token } = req.body;
      if (user) {
          if (isEmail(user)) {
            const token_result = await getTokenEmail();
            if (!token_result) {
                res.status(400).send({
                    isSuccess: false,
                    status_code: 400,
                    message: "Get token fail",
                });
                return;
            }
            const { access_token } = token_result;
            const user_result = await axios({
                method: 'get',
                url: process.env.JAMSAI_EMAIL_API_URL + '/user?email=' + user,
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            })
            if (user_result && user_result.data) {
                const { message, reference, data } = user_result.data
                if (!data) {
                    res.status(400).send({
                        isSuccess: false,
                        status_code: 400,
                        message: "Get email fail",
                    });
                    return;
                }
                const { count, users } = data
                if (!count || count < 1) {
                    res.status(400).send({
                        isSuccess: false,
                        status_code: 400,
                        message: "Get email fail",
                    });
                    return;
                }
                const { jamsai_id } = users[0];
                const result1 = await client.query("SELECT COUNT(*) FROM submitted_codes WHERE jamsai_id='" + jamsai_id + "'");
                const total = result1.rows.length > 0 ? result1.rows[0].count : 0;
                const result2 = await client.query("SELECT COUNT(*) FROM send_addresses WHERE jamsai_id='" + jamsai_id + "'");
                const addresses = result2.rows.length > 0 ? result2.rows[0].count : 0;
                const complete = Math.floor(total / 16);
                const result3 = await client.query("SELECT COUNT(*) FROM members WHERE jamsai_id='" + jamsai_id + "'");
                const member = result3.rows.length > 0 ? result3.rows[0].count : 0;
                if (member && member > 0) {
                    await client.query("UPDATE members SET data='" + JSON.stringify(users[0]) + "' WHERE jamsai_id='" + jamsai_id + "'");
                } else {
                    await client.query("INSERT INTO members (jamsai_id,data) VALUES ('" + jamsai_id + "','" + JSON.stringify(users[0]) + "')");
                }
                await linkAccount(jamsai_id, token);
                const result = {
                    ...users[0],
                    reference,
                    not_save_address: addresses < complete,
                }
                res.send({
                    isSuccess: message == "success",
                    status_code: 200,
                    result,
                    message: "Success",
                });
                return;
            } else {
                res.status(400).send({
                isSuccess: false,
                status_code: 400,
                message: "Login fail",
                });
                return;
            }
          } else {
            const token_result = await getToken();
            if (!token_result) {
                res.status(400).send({
                    isSuccess: false,
                    status_code: 400,
                    message: "Get token fail",
                });
                return;
            }
            const { access_token } = token_result;
            const user_result = await axios({
                method: 'get',
                url: process.env.JAMSAI_API_URL + '/api/users/' + user,
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            })
            if (user_result && user_result.data) {
                const { message, reference, data } = user_result.data
                const { jamsai_id } = data;
                const result4 = await client.query("SELECT COUNT(*) FROM submitted_codes WHERE jamsai_id='" + jamsai_id + "'");
                const total = result4.rows.length > 0 ? result4.rows[0].count : 0;
                const result5 = await client.query("SELECT COUNT(*) FROM send_addresses WHERE jamsai_id='" + jamsai_id + "'");
                const addresses = result5.rows.length > 0 ? result5.rows[0].count : 0;
                const complete = Math.floor(total / 16);
                const result6 = await client.query("SELECT COUNT(*) FROM members WHERE jamsai_id='" + jamsai_id + "'");
                const member = result6.rows.length > 0 ? result6.rows[0].count : 0;
                if (member && member > 0) {
                    await client.query("UPDATE members SET data='" + JSON.stringify(data) + "' WHERE jamsai_id='" + jamsai_id + "'");
                } else {
                    await client.query("INSERT INTO members (jamsai_id,data) VALUES ('" + jamsai_id + "','" + JSON.stringify(data) + "')");
                }
                await linkAccount(jamsai_id, token);
                const result = {
                    ...data,
                    reference,
                    not_save_address: addresses < complete,
                }
                res.send({
                    isSuccess: message == "Success",
                    status_code: 200,
                    result,
                    message: "Success",
                });
                return;
            } else {
                res.status(400).send({
                    isSuccess: false,
                    status_code: 400,
                    message: "Login fail",
                });
                return;
            }
          }
      } else {
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "User id can not be empty",
        });
        return;
      }
    } catch (err) {
      console.log("Error Login:", err);
      res.status(400).send({
        isSuccess: false,
        status_code: 400,
        message: "An error occurred while Login",
      });
      return;
    }
}
const submitCode = async (req, res) => {
    try {
        const { jamsai_id, codes } = req.body;
        if (!jamsai_id || !codes || codes.length < 1) {
            res.status(400).send({
                isSuccess: false,
                status_code: 400,
                message: "Get submit code fail",
            });
            return;
        }
        const query_codes = codes.map(code => "'" + code + "'").join(',');
        const result = await client.query("SELECT * FROM codes WHERE code in (" + query_codes + ")")
        const master_codes = result.rows;
        if (!master_codes || master_codes.length == 0) {
            const err_code = codes.map((code, index) => { return { index, code, is_error: true } })
            await client.query("INSERT INTO fail_submit (jamsai_id,created_date) VALUES ('" + jamsai_id + "',NOW())");
            res.status(400).send({
                data: err_code,
                isSuccess: false,
                status_code: 400,
                message: "Get submit code fail",
            });
            return;
        }
        const fail_codes = codes.map((code, index) => { 
            const mcode = master_codes.find(x => x.code == code);
            return { index, code, is_error: !mcode || mcode.is_use } 
        })
        const isAllPass = fail_codes.filter(x => x.is_error).length == 0;
        if (!isAllPass) {
            await client.query("INSERT INTO fail_submit (jamsai_id,created_date) VALUES ('" + jamsai_id + "',NOW())");
            res.status(400).send({
                data: fail_codes,
                isSuccess: false,
                status_code: 400,
                message: "Get submit code fail",
            });
            return;
        } else {
            const result1 = await client.query("SELECT COUNT(*) FROM submitted_codes WHERE jamsai_id='" + jamsai_id + "'");
            const prevCount = result1.rows.length > 0 ? result1.rows[0].count : 0;
            const queries = [];
            master_codes.map((code) => {
                queries.push(client.query("INSERT INTO submitted_codes (code_id,jamsai_id,created_date) VALUES ('" + code.id + "','" + jamsai_id + "',NOW())"));
            });
            await Promise.all(queries);
            const updatedCodes = master_codes.map(code => {
                return "'" + code.code + "'";
            })
            await client.query("UPDATE codes SET is_use=TRUE,updated_date=NOW() WHERE code in (" + updatedCodes.join(',') + ")");
            const total = prevCount + codes.length;
            const prevComplete = Math.floor(prevCount / 16);
            const complete = Math.floor(total / 16);
            const collected = total - (complete * 16);
            res.send({
                isSuccess: true,
                result: {
                    is_first: prevCount < 16 && total >= 16,
                    is_complete: complete > prevComplete,
                    total_reward: complete,
                    collected: collected > 0 ? collected : 16,
                },
                status_code: 200,
                message: "Success",
            });
            return;
        }
    } catch (err) {
        console.log("Error submitCode:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while submitting code",
        });
        return;
    }
}
const getSummary = async (req, res) => {
    try {
        const { jamsai_id } = req.query;
        const result = await client.query("SELECT COUNT(*) FROM submitted_codes WHERE jamsai_id='" + jamsai_id + "'");
        const total = result.rows.length > 0 ? result.rows[0].count : 0;
        const complete = Math.floor(total / 16);
        const collected = total - (complete * 16);
        res.send({
            isSuccess: true,
            result: {
                total_reward: complete,
                collected: collected > 0 ? collected : total == 0 ? 0 : 16,
            },
            status_code: 200,
            message: "Success",
        });
        return;
    } catch (err) {
        console.log("Error getSummary:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while getting summary",
        });
   }
}
const getSendAddress = async (req, res) => {
    try {
        const { jamsai_id } = req.query;
        const result1 = await client.query("SELECT * FROM send_addresses WHERE jamsai_id='" + jamsai_id + "' ORDER BY reward_no");
        const addresses = result1.rows;
        const result = addresses.map((addr) => {
            return {
                ...addr,
                id: parseInt(addr.id.toString(),10),
            }
        })
        res.send({
            isSuccess: true,
            status_code: 200,
            result,
            message: "Success",
        });
    } catch (err) {
        console.log("Error getSendAddress:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while getting send address",
        });
   }
}
const saveSendAddress = async (req, res) => {
    try {
        const { id, jamsai_id, name, mobile, house_no, village_no, road, sub_district, district, province, postalcode } = req.body;
        const result1 = await client.query("SELECT TOP(1) reward_no FROM send_addresses WHERE jamsai_id='" + jamsai_id + "' ORDER BY reward_no DESC");
        const last = result1.rows.length > 0 ? result1.rows[0] : null;
        const reward_no = last ? last.reward_no + 1 : 1;
        if (id) {
            await client.query("UPDATE send_addresses SET name='" + name + "', mobile='" + mobile + "', house_no='" + house_no + "', village_no='" + village_no + "', road='" + road + "', sub_district='" + sub_district + "', district='" + district + "', province='" + province + "', postalcode='" + postalcode + "', updated_date=NOW() WHERE id=" + id);
        } else {
            const token_result = await getToken();
            if (!token_result) {
                res.status(400).send({
                    isSuccess: false,
                    status_code: 400,
                    message: "Get token fail",
                });
                return;
            }
            const { access_token } = token_result;
            const user_result = await axios({
                method: 'get',
                url: process.env.JAMSAI_API_URL + '/api/users/' + jamsai_id,
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            })
            let email = '';
            if (user_result && user_result.data) {
                const { data } = user_result.data
                email = data.email;
            }
            const query = "INSERT INTO send_addresses (jamsai_id, name, mobile, house_no, village_no, road, sub_district, district, province, postalcode, reward_no, created_date, updated_date, status, email) VALUES "
            + "('" + jamsai_id + "','" + name + "','" + mobile + "','" + house_no + "','" + village_no + "','" + road + "','" + sub_district + "','" + district + "','" + province + "','" + postalcode + "'," + reward_no + ",NOW(),NOW(),'" + status + "')";
            await client.query(query);
        }
        res.send({
            isSuccess: true,
            status_code: 200,
            message: "Success",
        });
    } catch (err) {
        console.log("Error saveSendAddress:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while saving send address",
        });
   }
}
const updateSendStatus = async (req, res) => {
    try {
        const { id, status, tracking_url } = req.body;
        if (id) {
            await client.query("UPDATE send_addresses SET status='" + status + "',tracking_url='" + (tracking_url ?? '') + "' WHERE id=" + parseInt(id));
            res.redirect(process.env.stage + '/report');
        } else {
            res.status(400).send({
                isSuccess: false,
                status_code: 400,
                message: "An error occurred while updating send address status",
            });
        }
    } catch (err) {
        console.log("Error updateSendStatus:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while updating send address status",
        });
   }
}
const updateSendAll = async (req, res) => {
    try {
        const { status } = req.body;
        if (status) {
            await client.query("UPDATE send_addresses SET status='" + status + "';");
            res.redirect(process.env.stage + '/report');
        } else {
            res.status(400).send({
                isSuccess: false,
                status_code: 400,
                message: "An error occurred while updating send address status",
            });
        }
    } catch (err) {
        console.log("Error updateSendStatus:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while updating send address status",
        });
   }
}
const report = async (req, res) => {
    const { search } = req.query;
    const result = await client.query('SELECT * FROM send_addresses ' + (!search || search == 'ทั้งหมด' ? '' : 'WHERE status=\'' + search + '\'') + ' ORDER BY jamsai_id asc, reward_no asc');
	const data = result.rows;
    let rows = '';
    for(let i in data) {
        const item = data[i];
        const row = '<tr style="background-color:' + (item.status == 'เตรียมจัดส่ง' ? '#FEFFD2' : (item.status == 'จัดส่งแล้ว' ? '#BAE9FF' : '#fafafa')) + ';"><td style="text-align: center; padding: 8px 0;">' + (parseInt(i) + 1) + '</td><td>' 
        + item.jamsai_id + '</td><td>' 
        + item.name + '</td><td>' 
        + (item.mobile ?? '') + '</td><td>' 
        + (item.email ?? '') + '</td><td style="text-align: center;">' 
        + item.reward_no + '</td><td>' 
        + address(item) + '</td><th>' 
        + item.status + '</th><td>' 
        + '<form method="post" action="' + process.env.stage + '/update-address-status" style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 0; row-gap: 16px;"><input name="id" type="hidden" value="' + item.id 
        + '"/><select name="status" style="width: 100%; height: 30px; border-radius: 8px; border: 1px solid #ddd; padding: 4px 8px;"><option' + (item.status == 'ได้รับข้อมูล' ? ' selected' : '')
        + '>ได้รับข้อมูล</option><option' + (item.status == 'เตรียมจัดส่ง' ? ' selected' : '')
        + '>เตรียมจัดส่ง</option><option' + (item.status == 'จัดส่งแล้ว' ? ' selected' : '')
        + '>จัดส่งแล้ว</option></select><input type="text" name="tracking_url" value="'
        + (item.tracking_url ?? '') + '" placeholder="Tracking url" style="width: 100%; height: 30px; border-radius: 8px; border: 1px solid #ddd; padding: 4px 8px;"/><button type="submit" style="border-radius: 10px; border: 1px solid #6ACD39; padding: 8px 32px; font-size: 16px; background-color: #89E25D; color: #fff;">บันทึก</button></form></td></tr>';
        rows += row;
    }
    const table = '<table style="width: 100%;"><tr><th>#</th><th>Jamsai ID</th><th>ชื่อ-นามสกุล</th><th>เบอร์โทร</th><th>Email</th><th>Reward no.</th><th>ที่อยู่จัดส่ง</th><th>สถานะ</th><th>Action</th></tr>' + rows + '</table>';
    const html = '<html><head><title>16ปี แห่งความรัก - Report</title><style> th,td { border-bottom: 1px solid #ddd; padding: 8px 16px; } h4 { width: 150px; text-align: right; }</style></head><body>'
    + '<div style="width: 100%; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 500px;">'
    + '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 500px; width: 80%; margin-left: auto; margin-right: auto;border: 1px solid #ddd;">'
    + '<h1 style="margin: 40px auto 24px auto;">Jamsai 16 ปีแห่งความรัก Report</h1>'
    + '<div style="width: 100%; border-bottom: 1px solid #ddd;"><button style="border-radius: 8px 8px 0 0; width: 150px; height: 40px; cursor: pointer; background-color: #E9E2ED; border-bottom: none;">Report</button>'
    + '<button style="border-radius: 0 8px 0 0; width: 150px; height: 40px; cursor: pointer; background-color: #fff; border-left: none;" onclick="window.location.href=\'' + process.env.stage + '/tracking\'">Tracking Status</button></div>'
    + '<form method="post" action="' + process.env.stage + '/report-import" style="width: 100%; margin-bottom: 24px; display: flex; justify-content: flex-end; align-items: center;" enctype="multipart/form-data">'
    + '<input type="file" name="file" style="width: 250px; padding: 8px; border: 1px solid #e0e0e0;" />'
    + '<button type="submit" style="border-radius: 10px; border: 1px solid #CD6A39; padding: 8px 32px; font-size: 16px; background-color: #E2895D; color: #fff; cursor: pointer;">Import</button></form>'
    + '<form method="get" action="' + process.env.stage + '/report-export" target="_blank" style="width: 100%; margin-bottom: 24px; display: flex; justify-content: flex-end;">'
    + '<button type="submit" style="border-radius: 10px; border: 1px solid #6ACD39; padding: 8px 32px; font-size: 16px; background-color: #89E25D; color: #fff; cursor: pointer;">Export</button></form>'
    + '<form method="get" action="' + process.env.stage + '/report" style="margin-bottom: 24px; display: flex; align-items: center;"><h4>ค้นหา :</h4>&nbsp;&nbsp;'
    + '<select name="search" style="width: 150px; height: 30px; border-radius: 8px; border: 1px solid #ddd; padding: 4px 8px;"><option' + (!search || search == 'ทั้งหมด' ? ' selected' : '')
    + '>ทั้งหมด</option><option' + (search == 'ได้รับข้อมูล' ? ' selected' : '')
    + '>ได้รับข้อมูล</option><option' + (search == 'เตรียมจัดส่ง' ? ' selected' : '')
    + '>เตรียมจัดส่ง</option><option' + (search == 'จัดส่งแล้ว' ? ' selected' : '')
    + '>จัดส่งแล้ว</option></select>&nbsp;&nbsp;&nbsp;&nbsp;<button type="submit" style="border-radius: 10px; border: 1px solid #ddd; padding: 8px 32px; font-size: 16px; background-color: #E9E2ED; color: #000;">ค้นหา</button></form>'
    + '<form method="post" action="' + process.env.stage + '/update-address-all" style="margin-bottom: 24px; display: flex; align-items: center;"><h4>เปลี่ยนสถานะ :</h4>&nbsp;&nbsp;'
    + '<select name="status" style="width: 150px; height: 30px; border-radius: 8px; border: 1px solid #ddd; padding: 4px 8px;">' 
    + '<option>ได้รับข้อมูล</option><option>เตรียมจัดส่ง</option><option>จัดส่งแล้ว</option>' 
    + '</select>&nbsp;&nbsp;&nbsp;&nbsp;<button type="submit" style="border-radius: 10px; border: 1px solid #6ACD39; padding: 8px 32px; font-size: 16px; background-color: #89E25D; color: #000;">บันทึก</button></form>'
    + table + '</div></div></body></html>';
    res.send(html);
}
const reportExport = async (req, res) => {
    const HEADER_ROW = [
        {
          value: 'Jamsai ID',
          fontWeight: 'bold',
        },
        {
          value: 'ชื่อ-นามสกุล',
          fontWeight: 'bold'
        },
        {
          value: 'เบอร์โทร',
          fontWeight: 'bold'
        },
        {
          value: 'Email',
          fontWeight: 'bold'
        },
        {
          value: 'Reward no.',
          fontWeight: 'bold'
        },
        {
          value: 'ที่อยู่จัดส่ง',
          fontWeight: 'bold'
        },
        {
          value: 'สถานะ',
          fontWeight: 'bold'
        },
        {
          value: 'Tracking Url',
          fontWeight: 'bold'
        },
    ]
    const result = await client.query('SELECT * FROM send_addresses ORDER BY jamsai_id asc, reward_no asc');
    const addresses = result.rows;
    let rows = [];
    for(let i in addresses) {
        const item = addresses[i];
        rows.push([
            {
                type: String,
                value: item.jamsai_id
            },
            {
                type: String,
                value: item.name
            },
            {
                type: String,
                value: item.mobile
            },
            {
                type: String,
                value: item.email
            },
            {
                type: Number,
                value: item.reward_no
            },
            {
                type: String,
                value: address(item)
            },
            {
                type: String,
                value: item.status
            },
            {
                type: String,
                value: (item.tracking_url ?? '')
            }
        ])
    }
    const data = [
        HEADER_ROW,
        ...rows
    ];
    const buffer = await writeXlsxFile(data, { buffer: true });
    const fileName = 'report.xlsx';
    const fileType = 'application/vnd.ms-excel';
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Type': fileType,
    })
    res.end(buffer)
}
const tracking = async (req, res) => {
    const result1 = await client.query('SELECT jamsai_id, COUNT(jamsai_id) FROM submitted_codes GROUP BY jamsai_id');
	const codes = result1.rows;
    const jamsai_ids = codes.map(code => "'" + code.jamsai_id + "'");
    const result2 = await client.query('SELECT * FROM members WHERE jamsai_id in (' + jamsai_ids.join(',') + ') ORDER BY jamsai_id');
    const members = result2.rows;
    const data = members.map(member => {
        const code = codes.find(x => x.jamsai_id == member.jamsai_id);
        const detail = JSON.parse(member.data);
        return {
            ...detail,
            code_count: code ? code.count : 0,
        }
    })
    let rows = '';
    for(let i in data) {
        const item = data[i];
        const row = '<tr style="background-color:' + (item.status == 'เตรียมจัดส่ง' ? '#FEFFD2' : (item.status == 'จัดส่งแล้ว' ? '#BAE9FF' : '#fafafa')) + ';"><td style="text-align: center; padding: 8px 0;">' + (parseInt(i) + 1) + '</td><td>' 
        + item.jamsai_id + '</td><td>' 
        + (item.firstname + ' ' + item.lastname) + '</td><td>' 
        + (item.mobile ?? '') + '</td><td>' 
        + (item.email ?? '') + '</td><td style="text-align: center;">' 
        + item.code_count + '</td></tr>'
        rows += row;
    }
    const table = '<table style="width: 100%;"><tr><th>#</th><th>Jamsai ID</th><th>ชื่อ-นามสกุล</th><th>เบอร์โทร</th><th>Email</th><th>จำนวน Code</th></tr>' + rows + '</table>';
    const html = '<html><head><title>16ปี แห่งความรัก - Tracking</title><style> th,td { border-bottom: 1px solid #ddd; padding: 8px 16px; } h4 { width: 150px; text-align: right; }</style></head><body>'
    + '<div style="width: 100%; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 500px;">'
    + '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 500px; width: 80%; margin-left: auto; margin-right: auto;border: 1px solid #ddd;">'
    + '<h1 style="margin: 40px auto 24px auto;">Jamsai 16 ปีแห่งความรัก Tracking</h1>'
    + '<div style="width: 100%; border-bottom: 1px solid #ddd;"><button style="border-radius: 8px 0 0 0; width: 150px; height: 40px; cursor: pointer; background-color: #fff; border-right: none;" onclick="window.location.href=\'' + process.env.stage + '/report\'">Report</button>'
    + '<button style="border-radius: 8px 8px 0 0; width: 150px; height: 40px; cursor: pointer; background-color: #E9E2ED; border-bottom: none;">Tracking Status</button></div>'
    + '<form method="get" action="' + process.env.stage + '/tracking-export" target="_blank" style="width: 100%; margin-bottom: 24px; display: flex; justify-content: flex-end;">'
    + '<button type="submit" style="border-radius: 10px; border: 1px solid #6ACD39; padding: 8px 32px; font-size: 16px; background-color: #89E25D; color: #fff; cursor: pointer;">Export</button></form>'
    + table + '</div></div></body></html>';
    res.send(html);
}
const trackingExport = async (req, res) => {
    const HEADER_ROW = [
        {
          value: 'Jamsai ID',
          fontWeight: 'bold',
        },
        {
          value: 'ชื่อ-นามสกุล',
          fontWeight: 'bold'
        },
        {
          value: 'เบอร์โทร',
          fontWeight: 'bold'
        },
        {
          value: 'Email',
          fontWeight: 'bold'
        },
        {
          value: 'จำนวน Code',
          fontWeight: 'bold'
        },
    ]
    const result1 = await client.query('SELECT jamsai_id, COUNT(jamsai_id) FROM submitted_codes GROUP BY jamsai_id');
	const codes = result1.rows;
    const jamsai_ids = codes.map(code => "'" + code.jamsai_id + "'");
    const result2 = await client.query('SELECT * FROM members WHERE jamsai_id in (' + jamsai_ids.join(',') + ') ORDER BY jamsai_id');
    const members = result2.rows;
    const member_data = members.map(member => {
        const code = codes.find(x => x.jamsai_id == member.jamsai_id);
        const detail = JSON.parse(member.data);
        return {
            ...detail,
            code_count: code ? code.count : 0,
        }
    });
    let rows = [];
    for(let i in member_data) {
        const item = member_data[i];
        rows.push([
            {
                type: String,
                value: item.jamsai_id
            },
            {
                type: String,
                value: (item.firstname + ' ' + item.lastname)
            },
            {
                type: String,
                value: item.mobile
            },
            {
                type: String,
                value: item.email
            },
            {
                type: String,
                value: item.code_count
            },
        ])
    }
    const data = [
        HEADER_ROW,
        ...rows
    ];
    const buffer = await writeXlsxFile(data, { buffer: true });
    const fileName = 'tracking.xlsx';
    const fileType = 'application/vnd.ms-excel';
    res.writeHead(200, {
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Type': fileType,
    })
    res.end(buffer);
}

// #endregion

const getFuncs = {
    "summary": getSummary,
    "send-address": getSendAddress,
    report,
    tracking,
    "report-export": reportExport,
    "tracking-export": trackingExport,
}
const postFunc = {
    login,
    "check-login": checkLogin,
    "submit-code": submitCode,
    "send-address": saveSendAddress,
    "update-address-status": updateSendStatus,
    "update-address-all": updateSendAll,
}

// #region Routers
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors())
app.get('/hello', (req, res) => {
    res.send('Hello World')
});
app.post('/init-codes', upload.single('file'), async (req, res) => {
    try {
        const now = new Date();
        await readXlsxFile(Buffer.from(req.file.buffer)).then(async (rows) => {
            await prisma.codes.deleteMany({});
            const rmHead = rows.slice(1);
            const data = rmHead.map((item) => {
                return {
                    code: item && item.length > 0 ? item[0] : '',
                    is_use: false,
                    updated_date: now,
                }
            })
            await prisma.codes.createMany({ data });
        })
        res.send({
            isSuccess: true,
            status_code: 200,
            message: "Uploaded",
        });
    } catch (err) {
        console.log("Error initCode:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while init code",
        });
   }
});
app.post('/report-import', upload.single('file'), async (req, res) => {
    try {
        const { file } = req;
        if (file) {
            await readXlsxFile(Buffer.from(file.buffer)).then(async (rows) => {
                const data = rows.slice(1);
                for(let item of data) {
                    await prisma.send_addresses.updateMany({
                        where: {
                            jamsai_id: item[0],
                            reward_no: item[4],
                        },
                        data: {
                            status: item[6],
                            tracking_url: item. length > 6 ? item[7] : '',
                        }
                    });
                }
            })
            res.redirect('/report');
        } else {
            res.status(400).send({
                isSuccess: false,
                status_code: 400,
                message: "An error occurred while updating send address status",
            });
        }
    } catch (err) {
        console.log("Error updateSendStatus:", err);
        res.status(400).send({
            isSuccess: false,
            status_code: 400,
            message: "An error occurred while updating send address status",
        });
   }
});
app.get('/:path', async(req, res) => {
    const path = req.params.path;
    if (typeof getFuncs[path] == 'function')
        await getFuncs[path](req, res);
    else
     res.send(null)
});
app.post('/:path', async(req, res) => {
    const path = req.params.path;
    await postFunc[path](req, res);
});
// #endregion
// app.listen(8088, ()=> {
//     console.log('Start')
// })
module.exports.handler = serverless(app);