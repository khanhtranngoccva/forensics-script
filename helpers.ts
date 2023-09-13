export async function delay(seconds: number) {
    return new Promise<void>(resolve => {
        setTimeout(resolve, seconds * 1000);
    })
}
