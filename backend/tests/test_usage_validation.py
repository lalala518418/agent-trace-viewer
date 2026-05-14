import unittest
from types import SimpleNamespace

from backend.app.main import build_external_usage_validation
from backend.app.provider_pricing import estimate_usage_cost


def make_usage_record(
    *,
    provider: str,
    model_name: str,
    input_token_usage: int,
    output_token_usage: int,
    cached_token_usage: int,
    cost_usd: float,
    run_count: int = 1,
):
    # 用最小可用记录对象直连校验函数，避免测试依赖数据库或真实 API key。
    return SimpleNamespace(
        source=SimpleNamespace(provider=provider),
        model_name=model_name,
        run_count=run_count,
        token_usage=input_token_usage + output_token_usage,
        input_token_usage=input_token_usage,
        output_token_usage=output_token_usage,
        cached_token_usage=cached_token_usage,
        cost_usd=cost_usd,
    )


class UsageValidationTests(unittest.TestCase):
    def test_anthropic_rule_matches_official_snapshot(self):
        estimation = estimate_usage_cost(
            provider='anthropic',
            model_name='claude-sonnet-4',
            input_token_usage=200_000,
            output_token_usage=50_000,
            cached_token_usage=50_000,
        )

        self.assertIsNotNone(estimation)
        self.assertEqual(estimation['estimated_cost_usd'], 1.215)
        self.assertEqual(
            estimation['billing_formula'],
            '(uncached_input x $3.0/MTok) + (cached_input x $0.3/MTok) + (output x $15.0/MTok)',
        )

    def test_deepseek_rule_uses_cache_hit_discount(self):
        estimation = estimate_usage_cost(
            provider='deepseek',
            model_name='deepseek-chat',
            input_token_usage=100_000,
            output_token_usage=50_000,
            cached_token_usage=20_000,
        )

        self.assertIsNotNone(estimation)
        self.assertEqual(estimation['estimated_cost_usd'], 0.025256)
        self.assertEqual(
            estimation['billing_formula'],
            '(uncached_input x $0.14/MTok) + (cached_input x $0.0028/MTok) + (output x $0.28/MTok)',
        )

    def test_validation_marks_small_delta_as_match(self):
        estimation = estimate_usage_cost(
            provider='anthropic',
            model_name='claude-sonnet-4',
            input_token_usage=200_000,
            output_token_usage=50_000,
            cached_token_usage=50_000,
        )
        # 这里故意保留一个很小的偏差，锁定当前“接近官方价格仍视为 matched”的容差行为。
        record = make_usage_record(
            provider='anthropic',
            model_name='claude-sonnet-4',
            input_token_usage=200_000,
            output_token_usage=50_000,
            cached_token_usage=50_000,
            cost_usd=float(estimation['estimated_cost_usd']) + 0.0004,
            run_count=3,
        )

        validation = build_external_usage_validation([record], time_range_days=7, source_id=None)

        self.assertEqual(validation.supported_check_count, 1)
        self.assertEqual(validation.unsupported_check_count, 0)
        self.assertEqual(validation.checks[0].status, 'matched')
        self.assertEqual(validation.checks[0].delta_cost_usd, 0.0004)

    def test_validation_marks_larger_delta_as_drift(self):
        estimation = estimate_usage_cost(
            provider='openai-compatible',
            model_name='gpt-5.4-mini',
            input_token_usage=1_000_000,
            output_token_usage=200_000,
            cached_token_usage=100_000,
        )
        record = make_usage_record(
            provider='openai-compatible',
            model_name='gpt-5.4-mini',
            input_token_usage=1_000_000,
            output_token_usage=200_000,
            cached_token_usage=100_000,
            cost_usd=float(estimation['estimated_cost_usd']) + 0.00066,
            run_count=5,
        )

        validation = build_external_usage_validation([record], time_range_days=7, source_id=None)

        self.assertEqual(validation.supported_check_count, 1)
        self.assertEqual(validation.checks[0].status, 'drift')
        self.assertEqual(validation.checks[0].delta_cost_usd, 0.00066)

    def test_validation_marks_missing_official_rate(self):
        record = make_usage_record(
            provider='custom-gateway',
            model_name='internal-model-a',
            input_token_usage=100,
            output_token_usage=50,
            cached_token_usage=0,
            cost_usd=0.01,
        )

        validation = build_external_usage_validation([record], time_range_days=7, source_id=None)

        self.assertEqual(validation.supported_check_count, 0)
        self.assertEqual(validation.unsupported_check_count, 1)
        self.assertEqual(validation.checks[0].status, 'missing_official_rate')
        self.assertIsNone(validation.total_estimated_cost_usd)


if __name__ == '__main__':
    unittest.main()