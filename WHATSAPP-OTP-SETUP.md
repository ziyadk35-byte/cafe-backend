# WhatsApp OTP setup

The registration, resend-code and password-reset flows now use Meta WhatsApp Cloud API.

Add to the backend `.env`:

```env
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_OTP_TEMPLATE=dozo_login_code
WHATSAPP_RESET_TEMPLATE=dozo_reset_code
WHATSAPP_OTP_LANGUAGE=ar
WHATSAPP_OTP_BUTTON=true
```

Create/approve an Authentication template in WhatsApp Manager. A COPY_CODE authentication template is supported by the sender utility. The OTP is passed both to the body and to the authentication button.

Egyptian numbers entered as `01xxxxxxxxx` are normalized to `201xxxxxxxxx` before sending.

Until credentials/templates are configured, OTP is printed only in the backend console as `[DEV WHATSAPP OTP]` so development remains testable.
