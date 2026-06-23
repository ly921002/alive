function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}
export default {
  async fetch(request, env, ctx) {
    return new Response("CF Worker is alive 👋");
  },
  async scheduled(event, env, ctx) {
    console.log('=== 多站点 Cron 开始 ===', new Date().toISOString());

    const LOCK_TTL = 60 * 60 * 1000; // 60 分钟
    const kv = env.WORKFLOW_LOCK;

    // =============================
    // 多站点配置
    // =============================
    const sites = [
      {
        name: '',
        url: '',
        owner: 'ly921002',
        repo: 'docker-nodejs-argo',
        workflow_id: 'main.yml',
        ref: 'main',
      },

      // 继续加即可
    ];

    for (const site of sites) {
      const {
        name,
        url,
        owner,
        repo,
        workflow_id,
        ref,
      } = site;

      const LOCK_KEY = `workflow_lock:${name}`;

      console.log(`\n🔍 检查站点 [${name}] → ${url}`);

      try {
        // =============================
        // 锁检查
        // =============================
        const lockTime = await kv.get(LOCK_KEY);
        if (lockTime) {
          const elapsed = Date.now() - parseInt(lockTime, 10);
          if (elapsed < LOCK_TTL) {
            console.log(
              `⏳ [${name}] 已在执行中（${Math.floor(elapsed / 60000)} 分钟），跳过`
            );
            continue;
          }
        }

        // =============================
        // 站点检测
        // =============================
        const resp = await fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'CF-Worker-Monitor',
          },
        }, 8000);

        const text = await resp.text();
        const isError =
          resp.status === 404 ||
          resp.status >= 500 ||
          text.includes('404 page not found');

        console.log(`[${name}] 状态码: ${resp.status}`);
        console.log(`[${name}] 是否异常:`, isError);

        if (!isError) {
          console.log(`✅ [${name}] 正常`);
          continue;
        }

        // =============================
        // 触发 GitHub workflow
        // =============================
        console.log(`🚨 [${name}] 异常，触发部署`);

        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
          workflow_id
        )}/dispatches`;

        const ghResp = await fetch(githubUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'CF-Worker-Monitor',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref }),
        });

        console.log(`[${name}] GitHub 响应: ${ghResp.status}`);

        if (ghResp.ok) {
          await kv.put(LOCK_KEY, Date.now().toString());
          console.log(`🔒 [${name}] 已加锁（60 分钟）`);
        } else {
          const errText = await ghResp.text();
          console.error(`❌ [${name}] 触发失败:`, errText);
        }

      } catch (err) {
        console.error(`❌ [${name}] 检测异常:`, err.message);
      }
    }

    console.log('\n=== 多站点 Cron 结束 ===');
  },
};
