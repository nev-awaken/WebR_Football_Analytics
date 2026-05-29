import { DateTime } from "luxon";

export function ok(res, data = null, message = 'OK', status = 200) {
    return res.status(status).json({
        success: true,
        message: message,
        utc_timestamp: DateTime.utc().toFormat("yyyy-MM-dd HH:mm:ss ZZZZ"),
        data: data
    })
}

export function fail(res, data = null, message = 'OK', status = 500) {
    return res.status(status).json({
        success: false,
        message: message,
        utc_timestamp: DateTime.utc().toFormat("yyyy-MM-dd HH:mm:ss ZZZZ"),
        data: data
    })
}