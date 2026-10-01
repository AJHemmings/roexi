// A real roe addon settings.xml (Windower config lib output), used by importRoe tests and by the
// browser mock in place of the Tauri file picker. Note the empty <default /> profile — the roe
// addon always writes one, and import must skip it.
export const SAMPLE_ROE_SETTINGS = `<?xml version="1.1" ?>
<settings>
    <global>
        <blacklist />
        <clear>true</clear>
        <clearall>false</clearall>
        <clearprogress>false</clearprogress>
        <profiles>
            <aman>833,3768,16,3772,3774,3776,3778,358,941,3788,12,3771,3773,3775,3777,3045,3769,3770,3785,897,863,817,921</aman>
            <ambu>3760,3758,3998</ambu>
            <deeds>3781,3782,3783,3784,3785,3786,3779,3787,3780,3788</deeds>
            <default />
            <monthly>3775,3768,3776,3769,3777,3995,3778,3771,3758,3772,3770,3773,3760</monthly>
            <peculiar>3796,3789,3797,3790,3798,3791,3799,3792,3800,3793,3801,3794,3802,3795,3803</peculiar>
            <vagary>3406,3407,3400,3408,3401,3409,3402,3403,3404,3405</vagary>
        </profiles>
    </global>
</settings>
`;
