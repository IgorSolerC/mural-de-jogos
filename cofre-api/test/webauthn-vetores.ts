/**
 * Vetores reais de WebAuthn: um registro e duas assinaturas de cada algoritmo, feitos pelo autenticador
 * virtual do Chrome (DevTools Protocol, com verificação do usuário) numa página em http://localhost:4455
 * (rpId localhost), com desafios fixos: o registro com os bytes 1..32, as assinaturas com 33..64 e
 * 65..96, e o user.id com 0xa0..0xaf. As assinaturas também foram conferidas com o node:crypto ao gerar.
 */
export const ORIGEM = 'http://localhost:4455';
export const RP_ID = 'localhost';

export const VETORES = {
  es256: {
    reg: {
      id: '2-o4P_YICTNHoCjxfJw7PazC1y-5Cd5ROk_xRdMOpo8',
      clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiQVFJREJBVUdCd2dKQ2dzTURRNFBFQkVTRXhRVkZoY1lHUm9iSEIwZUh5QSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
      attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVikSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAQECAwQFBgcIAQIDBAUGBwgAINvqOD_2CAkzR6Ao8XycOz2swtcvuQneUTpP8UXTDqaPpQECAyYgASFYIOroReKrUHhuI797QIbOMHao4xX4vPh8ax_8Qib-ADGXIlgguGt95QxnIx_V1qS6Ib-q7DTDTh_JHkFyLQXJsV_VQa8'
    },
    assinaturas: [
      {
        id: '2-o4P_YICTNHoCjxfJw7PazC1y-5Cd5ROk_xRdMOpo8',
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiSVNJakpDVW1KeWdwS2lzc0xTNHZNREV5TXpRMU5qYzRPVG83UEQwLVAwQSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
        authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg',
        signature: 'MEUCIQCfadXsP7all9Oqon2c1Dq61ZK3OkqrSFcS9z75Tx7fDQIgQxvLn57aXvIQYuN-BFzBKpMKiKPatLb2nE0IDRoXCXk',
        userHandle: 'oKGio6SlpqeoqaqrrK2urw'
      },
      {
        id: '2-o4P_YICTNHoCjxfJw7PazC1y-5Cd5ROk_xRdMOpo8',
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiUVVKRFJFVkdSMGhKU2t0TVRVNVBVRkZTVTFSVlZsZFlXVnBiWEYxZVgyQSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
        authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAw',
        signature: 'MEYCIQDx1l18qau5gnGKUTsUVmShqTIfn8aZx4_CsqXF6V7CcwIhAO_nfhoXwDhF0ojL-m-y-lqDkgqRTvdGm3wyTzk_wY_D',
        userHandle: 'oKGio6SlpqeoqaqrrK2urw'
      }
    ]
  },
  rs256: {
    reg: {
      id: '_cS0d-XpkyHb9ECRIvWl0hdF6DhEYm94rgo_y5pM1bk',
      clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiQVFJREJBVUdCd2dKQ2dzTURRNFBFQkVTRXhRVkZoY1lHUm9iSEIwZUh5QSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZSwib3RoZXJfa2V5c19jYW5fYmVfYWRkZWRfaGVyZSI6ImRvIG5vdCBjb21wYXJlIGNsaWVudERhdGFKU09OIGFnYWluc3QgYSB0ZW1wbGF0ZS4gU2VlIGh0dHBzOi8vZ29vLmdsL3lhYlBleCJ9',
      attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVkBZ0mWDeWIDoxodDQXD2R2YFuP5K65ooYyx5lc87qDHZdjRQAAAAEBAgMEBQYHCAECAwQFBgcIACD9xLR35emTIdv0QJEi9aXSF0XoOERib3iuCj_LmkzVuaQBAwM5AQAgWQEA63kCYRIW3cVVA1U_XoUCYb_TD76RWe50kIakdZXUt6y6VktkD3J6Xr-LmrjQYUDpJUoOLcAfJL-gGaHtry-NsLGI_gTL6SmQMT23T4bDMffZxgaCDw2H-FiUiDkWA90NPKKcPk-JGJzdpD63fKlGhD8Lcgne6VDP3HmPHM0nqlsIoJPfgOuBtJp7TIBHvcUQbpGxAq1QY9ZlEaihQwbtLu5Hcz9XYOuMu_XUAzeKouFxoxJ4eSXSobceph4_YSJfYoibVshAnnwctGevsQuuse0ub09nj6DMyY3M2wKt2FgeMh-vynOaBpo24dqBLr_ZNf13SAnNXNRCFlvl0zMLySFDAQAB'
    },
    assinaturas: [
      {
        id: '_cS0d-XpkyHb9ECRIvWl0hdF6DhEYm94rgo_y5pM1bk',
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiSVNJakpDVW1KeWdwS2lzc0xTNHZNREV5TXpRMU5qYzRPVG83UEQwLVAwQSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
        authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAg',
        signature: 'Dy-YBuzQCQvsx4Ci5pxL3ORYmbmGhD6Lq-z_MEkJqYfZIDqEuhTt9wy88MrBS3yvceC74qXNs7q20UhXrkTsxFVQogMBTKTRYvrK6lORVjBJBruBSviKtYWrueDkiasV86nYpYy0KPE5tG8C4f-THtkrBqkeQHZdsLBNmfWmoWNo1uWNL0GxxJjBHSbg3Nt6rxzY4cG-Sh0DdPzslHkmiCQw-Qc5lb5m85WO1y7cx5Zq-3t4FUWq4VcOaf7zNSXNUD9E3Q-CkDgx_xpm2lFPwEYQr_kqPUQSed-BGj6-V_6FW4_DKiTuJzH4QlUKcgK_GS3v_eVWYF0p2I9k0NTGew',
        userHandle: 'oKGio6SlpqeoqaqrrK2urw'
      },
      {
        id: '_cS0d-XpkyHb9ECRIvWl0hdF6DhEYm94rgo_y5pM1bk',
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiUVVKRFJFVkdSMGhKU2t0TVRVNVBVRkZTVTFSVlZsZFlXVnBiWEYxZVgyQSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDQ1NSIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
        authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAw',
        signature: 'IYn-1jJF0M_ccfSI7Bva325fEWojbsntJtlIocblVISSIHFIi2dKGJZ9L9-Zp8Z53yIdWRNJM5K0WbK1Mfm8OSUHZWGNIUmRTY-N36T6Feqs7z4VdHy2r7W2sggiXijH3AsA3QRSJ1yNuFSaG_lHNnUkdy0Qr4M59qd9RFIedg5ExNJxOYMtkVyVJ95AFaYvdOeKNA3mZ03LbGYrkCzJIUjBsAcks92117KRuyvZWFjdKgNikJTTC_NsposHv-DBmqzrkCpGIvyfk_BnifRz4W9uCgHHlS2H8-OsmISMZHNgvIILrgUExJAzNdrgiDAHSEmQiIj1fY8Dy9h8s83yNQ',
        userHandle: 'oKGio6SlpqeoqaqrrK2urw'
      }
    ]
  }
} as const;
