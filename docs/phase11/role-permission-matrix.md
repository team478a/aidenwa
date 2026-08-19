# Phase 11 ロール権限マトリクス

記号: `○` 許可、`担当` 本人・割当範囲のみ、`—` 不許可、`PR2+` 後続PRで実装。すべてAPIでOrganization scopeを強制する。

| リソース                                  | system_admin                         | admin                    | manager（電話責任者）    | operator（電話担当者） | sales（営業担当者） |
| ----------------------------------------- | ------------------------------------ | ------------------------ | ------------------------ | ---------------------- | ------------------- |
| Organization                              | 全社 閲覧/作成/更新/停止: PR2、削除— | 自社 閲覧/更新           | 閲覧                     | —                      | —                   |
| User                                      | 全社: PR2                            | 自社 閲覧/作成/更新/停止 | 限定更新                 | —                      | —                   |
| Team                                      | 全社: PR2                            | 自社 閲覧/作成/更新/停止 | 閲覧                     | —                      | —                   |
| Company / Contact / Phone Number          | 全社: PR2                            | ○                        | ○                        | 担当 閲覧              | 担当 閲覧/更新      |
| Sales List                                | 全社: PR2                            | ○                        | ○                        | —                      | 担当 閲覧           |
| Product / AI Agent / Scenario / Knowledge | 全社: PR2                            | ○                        | ○                        | —                      | 閲覧                |
| Campaign                                  | 全社: PR2                            | 閲覧/作成/更新/開始/停止 | 閲覧/作成/更新/開始/停止 | —                      | 閲覧のみ            |
| Call Job / Call Result                    | 全社: PR2                            | 閲覧/作成/停止           | 閲覧/作成/停止           | 担当 閲覧              | 担当 閲覧           |
| Followup                                  | 全社: PR2                            | ○                        | 閲覧/割当/管理           | 担当 閲覧/更新/完了    | 担当 閲覧/更新/完了 |
| Handoff                                   | 全社: PR2                            | ○                        | 閲覧/更新/割当           | 担当 閲覧/更新         | 担当 閲覧/更新      |
| Appointment                               | 全社: PR2                            | ○                        | ○                        | 担当 閲覧              | 担当 閲覧/作成/更新 |
| Audit Log                                 | 全社: PR2                            | 自社 閲覧                | —                        | —                      | —                   |
| Integration Client                        | 全社: PR2                            | 自社 ○                   | —                        | —                      | —                   |
| Provider Configuration                    | 閲覧/更新                            | —                        | —                        | —                      | —                   |
| Emergency Stop                            | 全社 閲覧/開始/解除                  | 自社 閲覧/開始           | 自社 閲覧                | —                      | —                   |

## 強制規則

- `system_admin`はクライアント管理画面から作成できない。
- `operator`は組織設定、外部連携、監査ログ、キャンペーン操作へアクセスできない。
- `sales`はキャンペーンを開始・停止できない。
- operator/salesのFollowupとHandoffは、同一Organizationかつ本人へ割り当てられたデータだけを操作できる。
- 画面非表示は補助であり、APIのrole checkとOrganization条件を必須とする。
- 削除より停止・アーカイブを優先する。
