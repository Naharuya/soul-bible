import 'package:flutter/material.dart';
import '../app/app_theme.dart';
import '../app/space_scaffold.dart';
import '../app/api_config.dart';
import '../src/api/member_api_client.dart';

class SignUpPage extends StatefulWidget {
  const SignUpPage({super.key});
  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _church = TextEditingController();
  bool _busy = false;

  @override
  Widget build(BuildContext context) => SpaceScaffold(
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 42, 24, 24),
                children: [
                  const Align(alignment: Alignment.centerLeft, child: BackButton()),
                  Icon(Icons.auto_awesome, color: AppTheme.of(context).green, size: 38),
                  const SizedBox(height: 18),
                  Text('onaria 시작하기', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text('회원 정보를 등록할 수 있어요. 마음 기록은 현재 휴대폰에 저장되며 다른 기기로 자동 동기화되지 않아요.', style: TextStyle(color: AppTheme.of(context).muted)),
                  const SizedBox(height: 28),
                  Form(
                    key: _formKey,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text('회원 정보', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.of(context).ink)),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _name,
                        maxLength: 40,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(labelText: '이름', prefixIcon: Icon(Icons.person_outline)),
                        validator: _required,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(labelText: '전화번호', hintText: '010-0000-0000', prefixIcon: Icon(Icons.phone_outlined)),
                        validator: (value) => RegExp(r'^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$').hasMatch(value?.trim() ?? '')
                            ? null : '휴대폰 번호를 확인해 주세요.',
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _church,
                        maxLength: 100,
                        textInputAction: TextInputAction.done,
                        decoration: const InputDecoration(labelText: '교회명', prefixIcon: Icon(Icons.church_outlined)),
                        validator: _required,
                      ),
                      const SizedBox(height: 20),
                      _SocialButton(icon: const Text('N', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)), label: '네이버 로그인 (준비 중)', color: const Color(0xFF03C75A), onPressed: _showSocialLoginUnavailable),
                      const SizedBox(height: 8),
                      _SocialButton(icon: const Icon(Icons.chat_bubble, size: 20), label: '카카오 로그인 (준비 중)', color: const Color(0xFFFEE500), foreground: const Color(0xFF191919), onPressed: _showSocialLoginUnavailable),
                      const SizedBox(height: 8),
                      _SocialButton(icon: const Text('G', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)), label: 'Google 로그인 (준비 중)', color: AppTheme.of(context).panel, foreground: AppTheme.of(context).ink, onPressed: _showSocialLoginUnavailable, outlined: true),
                      const SizedBox(height: 80),
                      FilledButton.icon(onPressed: _busy ? null : _submit, icon: const Icon(Icons.check), label: Text(_busy ? '가입 중...' : '회원가입')),
                    ]),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  String? _required(String? value) => value == null || value.trim().isEmpty ? '입력해 주세요.' : null;
  void _showSocialLoginUnavailable() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('소셜 로그인은 아직 준비 중이에요. 아래 회원가입을 이용해 주세요.')),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final apiBaseUrl = ApiConfig.baseUrl;
    if (apiBaseUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('서버 설정이 필요해요. ${ApiConfig.setupHint}')),
      );
      return;
    }
    setState(() => _busy = true);
    final client = MemberApiClient(baseUrl: apiBaseUrl);
    try {
      await client.signUp(name: _name.text.trim(), phone: _phone.text.trim(), churchName: _church.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('회원가입이 완료되었어요.')));
      Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(
          error is MemberApiException ? error.message : '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
        )));
      }
    } finally {
      client.close();
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() { _name.dispose(); _phone.dispose(); _church.dispose(); super.dispose(); }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({required this.icon, required this.label, required this.color, required this.onPressed, this.foreground = Colors.white, this.outlined = false});
  final Widget icon;
  final String label;
  final Color color;
  final Color foreground;
  final VoidCallback onPressed;
  final bool outlined;
  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(backgroundColor: color, foregroundColor: foreground, side: outlined ? const BorderSide(color: Color(0xFFE0E0E0)) : null),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [icon, const SizedBox(width: 10), Text(label)]),
      );
}
